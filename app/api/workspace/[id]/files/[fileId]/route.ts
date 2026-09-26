/**
 * /api/workspace/[id]/files/[fileId] (ADR-019 P0).
 *
 * GET    → { url } presigned download (60 s, attachment), read role.
 * DELETE → soft delete (write role; uploader or doc owner). The object stays
 *          in R2 so History/restore remains possible; a purge job is later work.
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getDocRole, canRead, canWrite, checkAgentAccess } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { requesterFrom, requesterKey } from "@/lib/spaceWrite"
import { fileRoom } from "@/lib/workspaceFileRoom"
import { presignGet, R2_TTL } from "@/lib/r2"
import { recordWorkspaceActivity } from "@/lib/workspaceActivity"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string; fileId: string }> }

async function loadFile(id: string, fileId: string): Promise<Record<string, unknown> | null> {
  if (!(await fileRoom(id))) return null
  const r = await query(
    `SELECT * FROM dashboard.workspace_files WHERE id = $1 AND room_id = $2 AND deleted_at IS NULL`,
    [fileId, id],
  )
  return (r.rows[0] as Record<string, unknown> | undefined) ?? null
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id, fileId } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  if (await checkAgentAccess(id, cred, req.headers.get("x-agent-type"), "read")) return forbidden()
  if (!canRead(await getDocRole(cred, id))) return forbidden()
  try {
    const row = await loadFile(id, fileId)
    if (!row || (row.status !== "ready" && row.status !== "ingested"))
      return NextResponse.json({ error: "file not found" }, { status: 404 })
    const url = await presignGet(String(row.key), String(row.name))
    return NextResponse.json({ url, expiresIn: R2_TTL.get })
  } catch (e) {
    console.error("[workspace/files GET one]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id, fileId } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  if (await checkAgentAccess(id, cred, req.headers.get("x-agent-type"), "write")) return forbidden()
  const role = await getDocRole(cred, id)
  if (!canWrite(role)) return forbidden()
  try {
    const row = await loadFile(id, fileId)
    if (!row) return NextResponse.json({ error: "file not found" }, { status: 404 })
    const me = requesterFrom(req, cred)
    if (role !== "owner" && row.uploaded_by !== requesterKey(me)) return forbidden()
    await query(`UPDATE dashboard.workspace_files SET deleted_at = now(), updated_at = now() WHERE id = $1`, [fileId])
    await recordWorkspaceActivity({
      docId: id,
      credential: cred,
      agentType: me.agentType ?? "user",
      action: "file.deleted",
      targetType: "file",
      targetId: fileId,
      summary: `${me.name} removed ${String(row.name)}`,
    }).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[workspace/files DELETE]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
