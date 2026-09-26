/**
 * Room scope for file routes — SERVER-ONLY (ADR-019 P0).
 *
 * getDocRolesBatch treats a missing or ownerless doc as "claimable" and
 * returns editor for any signed-in user (right for creating a new page,
 * wrong for storage). Files therefore also require the room to exist, have
 * an owner and not be in the trash — otherwise anyone could park uploads
 * under an invented id.
 */
import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getDocRole, canRead, canWrite, checkAgentAccess } from "@/lib/workspaceAccess"
import { forbidden } from "@/lib/workspaceAuth"
import type { ScopeResolver } from "@/lib/workspaceFileHandlers"

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

export const roomScope: ScopeResolver = async (req, cred, id, need) => {
  if (await checkAgentAccess(id, cred, req.headers.get("x-agent-type"), need)) return forbidden()
  const role = await getDocRole(cred, id)
  if (!canRead(role)) return forbidden()
  const room = await fileRoom(id)
  if (!room) return NextResponse.json({ error: "room not found" }, { status: 404 })
  return {
    kind: "room",
    ownerId: id,
    workspaceId: room.workspaceId,
    canWrite: canWrite(role),
    canManage: role === "owner",
    activityDocId: id,
  }
}
