import { query } from "@/lib/db"
import { recordWorkspaceEvent } from "@/lib/workspaceEvents"
import type { WorkspaceCredential } from "@/lib/workspaceAuth"

type ActivityInput = {
  docId: string
  credential: WorkspaceCredential
  agentType?: string
  action: string
  summary: string
  targetType?: string
  targetId?: string
  status?: "proposed" | "applied" | "rejected" | "failed"
  metadata?: Record<string, unknown>
}

export async function recordWorkspaceActivity({
  docId,
  credential,
  agentType = "user",
  action,
  summary,
  targetType,
  targetId,
  status = "applied",
  metadata = {},
}: ActivityInput) {
  try {
    const actorType = credential.kind === "service" ? "agent" : "user"
    const actorId = credential.kind === "service" ? agentType : credential.user.user_id
    const actorName = credential.kind === "service" ? agentType.replace(/_/g, " ") : credential.user.email ?? credential.user.user_id
    const workspace = await query(
      `SELECT workspace_id FROM dashboard.workspace_docs
       WHERE id = $1 OR id = $2 LIMIT 1`,
      [docId, `workspace:${docId}`],
    )
    const workspaceId = (workspace.rows[0]?.workspace_id as string | undefined) ?? "default"

    await query(
      `INSERT INTO dashboard.workspace_activity
        (workspace_id, doc_id, actor_type, actor_id, actor_name, action, target_type, target_id, summary, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [workspaceId, docId, actorType, actorId, actorName, action, targetType ?? null, targetId ?? null, summary, status, JSON.stringify(metadata)],
    )
    // Dual-write to the Buzz-style kind log (kind = action verbatim so no
    // mapping can drift). Fire-and-forget like the activity insert above.
    await recordWorkspaceEvent({
      kind: action,
      workspaceId,
      docId,
      actorType: actorType as "user" | "agent" | "system",
      actorId,
      actorName,
      payload: {
        summary,
        status,
        target_type: targetType ?? null,
        target_id: targetId ?? null,
        metadata,
      },
    })
  } catch (error) {
    console.error("[workspace activity]", error)
  }
}
