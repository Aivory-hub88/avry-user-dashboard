/**
 * Room gate for file routes — SERVER-ONLY (ADR-019 P0).
 *
 * getDocRolesBatch treats a missing or ownerless doc as "claimable" and
 * returns editor for any signed-in user (right for creating a new page,
 * wrong for storage). Files therefore also require the room to exist, have
 * an owner and not be in the trash — otherwise anyone could park uploads
 * under an invented id.
 */
import { query } from "@/lib/db"

export async function fileRoom(id: string): Promise<{ workspaceId: string } | null> {
  const r = await query(
    `SELECT id, workspace_id, owner, deleted_at FROM dashboard.workspace_docs WHERE id = $1 OR id = $2`,
    [`workspace:${id}`, id],
  )
  const rows = r.rows as Record<string, unknown>[]
  const row = rows.find((x) => x.id === `workspace:${id}`) ?? rows[0]
  if (!row || !row.owner || row.deleted_at) return null
  return { workspaceId: String(row.workspace_id || "default") }
}
