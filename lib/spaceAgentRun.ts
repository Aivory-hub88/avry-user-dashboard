/**
 * Agent run core — SERVER-ONLY (db + backend fetch).
 *
 * Dipakai dua arah: route run (tombol Jalankan / lanjutkan approval) dan
 * fire-and-forget dari POST messages (chat-room: mention → agent jalan
 * sendiri tanpa klik). Hanya kredensial user (JWT diteruskan ke backend).
 */

import { query } from "@/lib/db";
import { recordWorkspaceActivity } from "@/lib/workspaceActivity";
import { parseSpaceMentions } from "@/lib/spaceProtocol";
import { spaceMessageFromRow } from "@/lib/spaceThreads";
import type { SpaceMessage } from "@/lib/spaceProtocol";
import {
  spaceAgentTaskFromRow,
  agentDisplayName,
  buildSpacePayload,
  type SpaceAgentTask,
} from "@/lib/spaceAgent";
import { newId } from "@/lib/spaceWrite";
import type { WorkspaceCredential } from "@/lib/workspaceAuth";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://backend.aivory.id";

export async function loadAgentTask(spaceId: string, taskId: string): Promise<SpaceAgentTask | null> {
  const found = await query(
    `SELECT * FROM dashboard.workspace_agent_tasks WHERE id = $1 AND space_id = $2`,
    [taskId, spaceId],
  );
  if (found.rows.length === 0) return null;
  return spaceAgentTaskFromRow(found.rows[0] as Record<string, unknown>);
}

export async function setAgentTask(
  taskId: string,
  status: string,
  reason: string,
  extra?: Record<string, unknown>,
) {
  const sets = ["status = $2", "reason = $3", "updated_at = now()"];
  const values: unknown[] = [taskId, status, reason];
  if (extra?.approvalRef !== undefined) {
    sets.push(`approval_ref = $${values.length + 1}`);
    values.push(JSON.stringify(extra.approvalRef));
  }
  if (extra?.resultMsg !== undefined) {
    sets.push(`result_msg = $${values.length + 1}`);
    values.push(extra.resultMsg);
  }
  await query(`UPDATE dashboard.workspace_agent_tasks SET ${sets.join(", ")} WHERE id = $1`, values);
}

export interface RunResult {
  task: SpaceAgentTask | null;
  message?: SpaceMessage | null;
  pendingApproval?: { id: string; tool_name: string; risk_tier: string } | null;
  error?: string;
  status: number;
}

/**
 * Jalankan 1 task sebagai user ini. Idempoten-aman: task yang tidak lagi
 * runnable (sudah diambil worker lain) → 409, tanpa efek samping.
 */
export async function runAgentTask(opts: {
  spaceId: string;
  taskId: string;
  credential: Extract<WorkspaceCredential, { kind: "user" }>;
  afterApprovalId?: string | null;
  decision?: "approve" | "deny";
}): Promise<RunResult> {
  const { spaceId: id, taskId, credential, afterApprovalId, decision = "approve" } = opts;
  const task = await loadAgentTask(id, taskId);
  if (!task) return { task: null, error: "not found", status: 404 };
  const runnable =
    task.status === "todo" || task.status === "failed" || (task.status === "blocked" && !!afterApprovalId);
  if (!runnable) return { task, error: `task ${task.status}`, status: 409 };

  await setAgentTask(taskId, "in_progress", "running");

  const instruction = afterApprovalId
    ? `${task.instruction}\n\n[Approval ${afterApprovalId} diputuskan ${decision} oleh manusia — lanjutkan turn yang diparkir.]`
    : task.instruction;

  // Transkrip thread (data mentah). Identitas + konteks channel milik
  // deployment channel backend (binding discussion_* + room session) —
  // tanpa coaching prompt yang memanjangkan pesan.
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
    prompt = buildSpacePayload({ instruction, history });
  } catch {
    // Konteks best-effort — instruksi polos tetap jalan.
  }

  let reply = "";
  let pendingApproval: { id: string; tool_name: string; risk_tier: string } | null = null;
  try {
    const upstream = await fetch(`${BACKEND_URL}/api/v1/telegram/discussion-turn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credential.token}`,
      },
      body: JSON.stringify({
        agent_type: task.agentType,
        space_id: id,
        thread_root: task.threadRoot,
        text: prompt,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!upstream.ok) throw new Error(`agent-chat ${upstream.status}`);
    const data = (await upstream.json()) as {
      reply?: unknown;
      pending_approval?: { id: string; tool_name: string; risk_tier: string } | null;
    };
    reply = typeof data.reply === "string" ? data.reply.trim() : "";
    pendingApproval = data.pending_approval ?? null;
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 300) : "agent unreachable";
    await setAgentTask(taskId, "failed", reason);
    await recordWorkspaceActivity({
      docId: id,
      credential,
      agentType: task.agentType,
      action: "agent.failed",
      summary: `${agentDisplayName(task.agentType)} failed: ${reason}`,
    }).catch(() => {});
    return { task: await loadAgentTask(id, taskId), error: "agent unreachable", status: 502 };
  }

  if (pendingApproval) {
    await setAgentTask(taskId, "blocked", `waiting for approval: ${pendingApproval.tool_name}`, {
      approvalRef: pendingApproval,
    });
    return { task: await loadAgentTask(id, taskId), pendingApproval, status: 200 };
  }

  if (!reply) {
    await setAgentTask(taskId, "failed", "agent returned empty reply");
    return { task: await loadAgentTask(id, taskId), error: "empty reply", status: 502 };
  }

  // Tulis balik sebagai agent itu (message, bukan artifact) + reason terlihat.
  const stamps = parseSpaceMentions(reply);
  const msgId = newId();
  const name = agentDisplayName(task.agentType);
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
  );
  const message = spaceMessageFromRow(inserted.rows[0] as Record<string, unknown>, id);
  await setAgentTask(taskId, "done", "agent reply", { resultMsg: msgId });
  await recordWorkspaceActivity({
    docId: id,
    credential,
    agentType: task.agentType,
    action: "agent.replied",
      summary: `${name} replied in the thread`,
  }).catch(() => {});
  return { task: await loadAgentTask(id, taskId), message, status: 200 };
}
