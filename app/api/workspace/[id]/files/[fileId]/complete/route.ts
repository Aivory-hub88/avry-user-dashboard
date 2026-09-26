/**
 * POST /api/workspace/[id]/files/[fileId]/complete — verify an upload (ADR-019 P0).
 *
 * HEADs the object: it must exist, match the declared size exactly and carry
 * the declared content type (signed into the presigned PUT). Match → ready.
 * Mismatch → object deleted, row failed. Only the uploader may complete, and
 * only while pending; repeating it on a ready file is a no-op 200.
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getDocRole, canWrite, checkAgentAccess } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { requesterFrom, requesterKey } from "@/lib/spaceWrite"
import { fileFromRow } from "@/lib/workspaceFiles"
import { fileRoom } from "@/lib/workspaceFileRoom"
import { headObject, deleteObject } from "@/lib/r2"
import { recordWorkspaceActivity } from "@/lib/workspaceActivity"

export const runtime = "nodejs"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  if (await checkAgentAccess(id, cred, req.headers.get("x-agent-type"), "write")) return forbidden()
  if (!canWrite(await getDocRole(cred, id))) return forbidden()

  try {
    if (!(await fileRoom(id))) return NextResponse.json({ error: "room not found" }, { status: 404 })
    const found = await query(
      `SELECT * FROM dashboard.workspace_files WHERE id = $1 AND room_id = $2 AND deleted_at IS NULL`,
      [fileId, id],
    )
    const row = found.rows[0] as Record<string, unknown> | undefined
    if (!row) return NextResponse.json({ error: "file not found" }, { status: 404 })
    const me = requesterFrom(req, cred)
    if (row.uploaded_by !== requesterKey(me)) return forbidden()
    if (row.status === "ready" || row.status === "ingested") return NextResponse.json({ file: fileFromRow(row) })
    if (row.status !== "pending") return NextResponse.json({ error: "upload failed, start again" }, { status: 409 })

    const key = String(row.key)
    const head = await headObject(key)
    if (!head) return NextResponse.json({ error: "upload not received yet" }, { status: 409 })

    const ok = head.size === Number(row.size) && head.mime === String(row.mime)
    if (!ok) {
      await deleteObject(key).catch((e) => console.error("[workspace/files complete delete]", e))
      await query(`UPDATE dashboard.workspace_files SET status = 'failed', updated_at = now() WHERE id = $1`, [fileId])
      return NextResponse.json({ error: "uploaded file doesn't match what was declared" }, { status: 422 })
    }

    const updated = await query(
      `UPDATE dashboard.workspace_files SET status = 'ready', updated_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [fileId],
    )
    const file = fileFromRow((updated.rows[0] ?? { ...row, status: "ready" }) as Record<string, unknown>)
    await recordWorkspaceActivity({
      docId: id,
      credential: cred,
      agentType: me.agentType ?? "user",
      action: "file.uploaded",
      targetType: "file",
      targetId: fileId,
      summary: `${me.name} uploaded ${file.name}`,
    }).catch(() => {})
    return NextResponse.json({ file })
  } catch (e) {
    console.error("[workspace/files complete]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
