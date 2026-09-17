/**
 * POST /api/workspace/[id]/agent-tasks/[task]/run — jemput eksekusi.
 * (Tombol Jalankan / lanjutkan approval; auto-run primer kini fire-and-
 * forget dari POST messages.) Inti di `lib/spaceAgentRun.ts`.
 *
 * - Hanya kredensial user (agent tidak memicu agent — depth 1, ADR-008).
 * - Gate tulis: owner/editor.
 * - Reply → pesan agent + task done. pending_approval → task blocked +
 *   approval_ref, NOL tulis (guard irreversible: Deny = nol tulis).
 * - blocked + body.afterApprovalId → lanjutkan turn yang diparkir.
 */
import { NextRequest, NextResponse } from "next/server"
import { getDocRole, canWrite } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { recordWorkspaceActivity } from "@/lib/workspaceActivity"
import { agentDisplayName } from "@/lib/spaceAgent"
import { loadAgentTask, setAgentTask, runAgentTask } from "@/lib/spaceAgentRun"

export const runtime = "nodejs"
export const maxDuration = 180

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
    const result = await runAgentTask({
      spaceId: id,
      taskId,
      credential,
      afterApprovalId,
      decision,
    })
    if (result.error) {
      return NextResponse.json(
        { error: result.error, task: result.task, message: result.message, pendingApproval: result.pendingApproval },
        { status: result.status },
      )
    }
    return NextResponse.json({ task: result.task, message: result.message, pendingApproval: result.pendingApproval })
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
    const task = await loadAgentTask(id, taskId)
    if (!task) return NextResponse.json({ error: "not found" }, { status: 404 })
    if (task.status === "done" || task.status === "cancelled")
      return NextResponse.json({ error: `task ${task.status}` }, { status: 409 })
    await setAgentTask(taskId, "cancelled", "cancelled by human")
    const who = credential.kind === "user" ? (credential.user.email ?? credential.user.user_id) : "service"
    await recordWorkspaceActivity({
      docId: id,
      credential,
      agentType: task.agentType,
      action: "agent.cancelled",
      summary: `${who} cancelled ${agentDisplayName(task.agentType)}'s task`,
    }).catch(() => {})
    return NextResponse.json({ task: await loadAgentTask(id, taskId) })
  } catch (error) {
    console.error("[workspace/agent-tasks PATCH]", error)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
