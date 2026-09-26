/**
 * /api/workspace/[id]/files — room files on R2 (ADR-019 P0).
 *
 * GET  → list ready/ingested files of the room (read role).
 * POST { name, mime, size } → pending row + presigned PUT (write role).
 *      The browser PUTs the bytes to R2 itself with header Content-Type =
 *      the declared mime, then calls POST .../files/[fileId]/complete.
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getDocRole, canRead, canWrite, checkAgentAccess } from "@/lib/workspaceAccess"
import { workspaceCredential, unauthorized, forbidden } from "@/lib/workspaceAuth"
import { requesterFrom, requesterKey, newId } from "@/lib/spaceWrite"
import { validateUploadIntent, objectKey, fileFromRow } from "@/lib/workspaceFiles"
import { fileRoom } from "@/lib/workspaceFileRoom"
import { presignPut, r2Configured, R2_TTL } from "@/lib/r2"

export const runtime = "nodejs"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  if (await checkAgentAccess(id, cred, req.headers.get("x-agent-type"), "read")) return forbidden()
  if (!canRead(await getDocRole(cred, id))) return forbidden()
  try {
    if (!(await fileRoom(id))) return NextResponse.json({ error: "room not found" }, { status: 404 })
    const r = await query(
      `SELECT * FROM dashboard.workspace_files
       WHERE room_id = $1 AND deleted_at IS NULL AND status IN ('ready', 'ingested')
       ORDER BY created_at DESC LIMIT 200`,
      [id],
    )
    return NextResponse.json({ files: r.rows.map((row) => fileFromRow(row as Record<string, unknown>)) })
  } catch (e) {
    console.error("[workspace/files GET]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  if (await checkAgentAccess(id, cred, req.headers.get("x-agent-type"), "write")) return forbidden()
  if (!canWrite(await getDocRole(cred, id))) return forbidden()
  if (!r2Configured()) return NextResponse.json({ error: "file storage not configured" }, { status: 503 })

  const v = validateUploadIntent(await req.json().catch(() => null))
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { name, mime, size } = v.intent

  try {
    const room = await fileRoom(id)
    if (!room) return NextResponse.json({ error: "room not found" }, { status: 404 })
    const workspaceId = room.workspaceId
    const fileId = newId()
    let key: string
    try {
      key = objectKey({ workspaceId, roomId: id, fileId, name, mime })
    } catch {
      return NextResponse.json({ error: "invalid room id" }, { status: 400 })
    }
    const inserted = await query(
      `INSERT INTO dashboard.workspace_files
         (id, workspace_id, room_id, key, name, mime, size, status, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
       RETURNING *`,
      [fileId, workspaceId, id, key, name, mime, size, requesterKey(requesterFrom(req, cred))],
    )
    const url = await presignPut(key, mime)
    return NextResponse.json(
      {
        file: fileFromRow(inserted.rows[0] as Record<string, unknown>),
        upload: { url, method: "PUT", headers: { "Content-Type": mime }, expiresIn: R2_TTL.put },
      },
      { status: 201 },
    )
  } catch (e) {
    console.error("[workspace/files POST]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
