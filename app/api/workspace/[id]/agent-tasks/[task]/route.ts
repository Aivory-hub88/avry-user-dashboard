/**
 * POST /api/workspace/[id]/agent-tasks/[task]/run — jemput eksekusi (Phase 3).
 *
 * Client-triggered (dipanggil UI setelah enqueue / tombol Jalankan):
 * meneruskan JWT user ke backend /api/v1/telegram/agent-chat, lalu menulis
 * hasilnya balik SEBAGAI agent itu (atribusi + reason, TRD §5).
 *
 * - Hanya kredensial user (agent tidak memicu agent — depth 1, ADR-008).
 * - Gate tulis: owner/editor.
 * - Reply → pesan agent + task done. pending_approval → task blocked +
 *   approval_ref, NOL tulis (guard irreversible: Deny = nol tulis).
 * - blocked + body.afterApprovalId → lanjutkan turn yang diparkir.
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getDocRole, canWrite } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { recordWorkspaceActivity } from "@/lib/workspaceActivity"
import { parseSpaceMentions } from "@/lib/spaceProtocol"
import { spaceMessageFromRow } from "@/lib/spaceThreads"
import { spaceAgentTaskFromRow, agentDisplayName, buildSpacePayload, type SpaceAgentTask } from "@/lib/spaceAgent"
import { newId } from "@/lib/spaceWrite"

export const runtime = "nodejs"
export const maxDuration = 180

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://backend.aivory.id"

async function loadTask(spaceId: string, taskId: string): Promise<SpaceAgentTask | null> {
  const found = await query(
    `SELECT * FROM dashboard.workspace_agent_tasks WHERE id = $1 AND space_id = $2`,
    [taskId, spaceId],
  )
  if (found.rows.length === 0) return null
  return spaceAgentTaskFromRow(found.rows[0] as Record<string, unknown>)
}

async function setTask(taskId: string, status: string, reason: string, extra?: Record<string, unknown>) {
  const sets = ["status = $2", "reason = $3", "updated_at = now()"]
  const values: unknown[] = [taskId, status, reason]
  if (extra?.approvalRef !== undefined) {
    sets.push(`approval_ref = $${values.length + 1}`)
    values.push(JSON.stringify(extra.approvalRef))
  }
  if (extra?.resultMsg !== undefined) {
    sets.push(`result_msg = $${values.length + 1}`)
    values.push(extra.resultMsg)
  }
  await query(`UPDATE dashboard.workspace_agent_tasks SET ${sets.join(", ")} WHERE id = $1`, values)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; task: string }> },
) {
  const { id, task: taskId } = await params
  const credential = workspaceCredential(req)
  if (!credential) return unauthorized()
  if (credential.kind !== "user") return forbidden()
  if (!canWrite(await getDocRole(credential, id))) return forbidden()

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const afterApprovalId = typeof payload.afterApprovalId === "string" ? payload.afterApprovalId : null
  const decision = payload.decision === "deny" ? "deny" : "approve"

  try {
    const task = await loadTask(id, taskId)
    if (!task) return NextResponse.json({ error: "not found" }, { status: 404 })
    const runnable =
      task.status === "todo" || task.status === "failed" || (task.status === "blocked" && afterApprovalId)
    if (!runnable) return NextResponse.json({ error: `task ${task.status}` }, { status: 409 })

    await setTask(taskId, "in_progress", "running")

    const instruction = afterApprovalId
      ? `${task.instruction}\n\n[Approval ${afterApprovalId} diputuskan ${decision} oleh manusia — lanjutkan turn yang diparkir.]`
      : task.instruction

    // Konteks thread ala Room: transkrip ber-tag author + peer agents.
    let prompt = instruction;
    try {
      const hist = await query(
        `SELECT author_kind, author_id, author_name, agent_type, body
         FROM dashboard.workspace_messages
         WHERE space_id = $1 AND (id = $2 OR thread_root = $2)
         ORDER BY created_at ASC LIMIT 10`,
        [id, task.threadRoot],
      );
      const history = (hist.rows as Record<string, unknown>[])
        .map((r) => {
          const kind = String(r.author_kind ?? "user");
          const name =
            kind === "agent"
              ? agentDisplayName(String(r.agent_type ?? ""))
              : typeof r.author_name === "string" && r.author_name
                ? r.author_name
                : String(r.author_id ?? "Someone");
          return { author: name, text: typeof r.body === "string" ? r.body : "" };
        })
        .filter((h) => h.text.trim());
      const peers = await query(
        `SELECT DISTINCT agent_type FROM dashboard.workspace_agent_tasks
         WHERE space_id = $1 AND thread_root = $2 AND agent_type <> $3
           AND status IN ('todo', 'in_progress', 'blocked')`,
        [id, task.threadRoot, task.agentType],
      );
      prompt = buildSpacePayload({
        me: agentDisplayName(task.agentType),
        peers: (peers.rows as Record<string, unknown>[]).map((r) =>
          agentDisplayName(String(r.agent_type)),
        ),
        instruction,
        history,
      });
    } catch {
      // Konteks best-effort — instruksi polos tetap jalan.
    }

    let reply = ""
    let pendingApproval: { id: string; tool_name: string; risk_tier: string } | null = null
    try {
      const upstream = await fetch(`${BACKEND_URL}/api/v1/telegram/agent-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credential.token}`,
        },
        body: JSON.stringify({
          agent_type: task.agentType,
          text: prompt,
          conversation_id: `space:${id}:${task.threadRoot}:${task.agentType}`,
        }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!upstream.ok) throw new Error(`agent-chat ${upstream.status}`)
      const data = (await upstream.json()) as {
        reply?: unknown
        pending_approval?: { id: string; tool_name: string; risk_tier: string } | null
      }
      reply = typeof data.reply === "string" ? data.reply.trim() : ""
      pendingApproval = data.pending_approval ?? null
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 300) : "agent unreachable"
      await setTask(taskId, "failed", reason)
      await recordWorkspaceActivity({
        docId: id,
        credential,
        agentType: task.agentType,
        action: "agent.failed",
        summary: `${agentDisplayName(task.agentType)} gagal: ${reason}`,
      }).catch(() => {})
      return NextResponse.json({ error: "agent unreachable", task: await loadTask(id, taskId) }, { status: 502 })
    }

    if (pendingApproval) {
      await setTask(taskId, "blocked", `menunggu approval: ${pendingApproval.tool_name}`, {
        approvalRef: pendingApproval,
      })
      return NextResponse.json({ task: await loadTask(id, taskId), pendingApproval })
    }

    if (!reply) {
      await setTask(taskId, "failed", "agent returned empty reply")
      return NextResponse.json({ error: "empty reply", task: await loadTask(id, taskId) }, { status: 502 })
    }

    // Tulis balik sebagai agent itu (message, bukan artifact) + reason terlihat.
    const stamps = parseSpaceMentions(reply)
    const msgId = newId()
    const name = agentDisplayName(task.agentType)
    const inserted = await query(
      `INSERT INTO dashboard.workspace_messages
         (id, space_id, thread_root, author_kind, author_id, author_name, agent_type,
          body, mentions, member_ids, here, has_agent, doc_refs)
       VALUES ($1, $2, $3, 'agent', $4, $5, $4, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        msgId, id, task.threadRoot, task.agentType, name, reply,
        stamps.agentTypes, stamps.memberIds, stamps.here, stamps.hasAgent, stamps.docRefs,
      ],
    )
    const message = spaceMessageFromRow(inserted.rows[0] as Record<string, unknown>, id)
    await setTask(taskId, "done", "agent reply", { resultMsg: msgId })
    await recordWorkspaceActivity({
      docId: id,
      credential,
      agentType: task.agentType,
      action: "agent.replied",
      summary: `${name} membalas di thread`,
    }).catch(() => {})
    return NextResponse.json({ task: await loadTask(id, taskId), message })
  } catch (error) {
    console.error("[workspace/agent-tasks run]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

/**
 * PATCH — { op: "cancel" }: batalkan task terbuka (todo/in_progress/blocked).
 * Dipakai Deny di kartu approval: Deny = nol tulis + audit.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; task: string }> },
) {
  const { id, task: taskId } = await params
  const credential = workspaceCredential(req)
  if (!credential) return unauthorized()
  if (!canWrite(await getDocRole(credential, id))) return forbidden()

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (payload.op !== "cancel") return NextResponse.json({ error: "invalid op" }, { status: 400 })

  try {
    const task = await loadTask(id, taskId)
    if (!task) return NextResponse.json({ error: "not found" }, { status: 404 })
    if (task.status === "done" || task.status === "cancelled")
      return NextResponse.json({ error: `task ${task.status}` }, { status: 409 })
    await setTask(taskId, "cancelled", "dibatalkan manusia")
    const who = credential.kind === "user" ? (credential.user.email ?? credential.user.user_id) : "service"
    await recordWorkspaceActivity({
      docId: id,
      credential,
      agentType: task.agentType,
      action: "agent.cancelled",
      summary: `${who} membatalkan tugas ${agentDisplayName(task.agentType)}`,
    }).catch(() => {})
    return NextResponse.json({ task: await loadTask(id, taskId) })
  } catch (error) {
    console.error("[workspace/agent-tasks PATCH]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
