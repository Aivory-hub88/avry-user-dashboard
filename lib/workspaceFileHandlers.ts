/**
 * Shared file-route handlers — SERVER-ONLY (ADR-019 P0/P1).
 *
 * Files belong to a room (room_id) or, before approval, to a project request
 * (request_id). Each route file supplies a scope resolver that does its own
 * ACL and returns what the caller may do; the handlers own validation,
 * presigning, upload verification and the soft delete. A resolver returns a
 * Response (401/403/404) to stop the request.
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { unauthorized, workspaceCredential, type WorkspaceCredential } from "@/lib/workspaceAuth"
import { requesterFrom, requesterKey, newId } from "@/lib/spaceWrite"
import { validateUploadIntent, objectKey, fileFromRow, type FileOwnerKind } from "@/lib/workspaceFiles"
import { presignPut, presignGet, headObject, deleteObject, r2Configured, R2_TTL } from "@/lib/r2"
import { recordWorkspaceActivity } from "@/lib/workspaceActivity"
import { ingestRoomFiles, dropFileChunks, fileHasText } from "@/lib/roomContext"
import { onFileAdded, postSystemNote } from "@/lib/roomProactive"

export interface FileScope {
  kind: FileOwnerKind
  ownerId: string
  workspaceId: string
  /** May upload / complete own uploads / delete own files. */
  canWrite: boolean
  /** May delete anyone's file in this scope. */
  canManage: boolean
  /** Doc id activity is recorded against (room id, or null for requests). */
  activityDocId: string | null
}

export type ScopeResolver = (
  req: NextRequest,
  cred: WorkspaceCredential,
  ownerId: string,
  need: "read" | "write",
) => Promise<FileScope | Response>

const COLUMN: Record<FileOwnerKind, "room_id" | "request_id"> = { room: "room_id", request: "request_id" }

const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 })

async function scopeFor(
  req: NextRequest,
  ownerId: string,
  resolve: ScopeResolver,
  need: "read" | "write",
): Promise<{ cred: WorkspaceCredential; scope: FileScope } | Response> {
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const scope = await resolve(req, cred, ownerId, need)
  if (scope instanceof Response) return scope
  if (need === "write" && !scope.canWrite) return forbidden()
  return { cred, scope }
}

async function loadFile(scope: FileScope, fileId: string): Promise<Record<string, unknown> | null> {
  const r = await query(
    `SELECT * FROM dashboard.workspace_files WHERE id = $1 AND ${COLUMN[scope.kind]} = $2 AND deleted_at IS NULL`,
    [fileId, scope.ownerId],
  )
  return (r.rows[0] as Record<string, unknown> | undefined) ?? null
}

async function logActivity(scope: FileScope, cred: WorkspaceCredential, agentType: string | undefined, action: string, fileId: string, summary: string) {
  if (!scope.activityDocId) return
  await recordWorkspaceActivity({
    docId: scope.activityDocId,
    credential: cred,
    agentType: agentType ?? "user",
    action,
    targetType: "file",
    targetId: fileId,
    summary,
  }).catch(() => {})
}

export async function listFiles(req: NextRequest, ownerId: string, resolve: ScopeResolver): Promise<Response> {
  const s = await scopeFor(req, ownerId, resolve, "read")
  if (s instanceof Response) return s
  try {
    const r = await query(
      `SELECT * FROM dashboard.workspace_files
       WHERE ${COLUMN[s.scope.kind]} = $1 AND deleted_at IS NULL AND status IN ('ready', 'ingested')
       ORDER BY created_at DESC LIMIT 200`,
      [ownerId],
    )
    return NextResponse.json({ files: r.rows.map((row) => fileFromRow(row as Record<string, unknown>)) })
  } catch (e) {
    console.error("[workspace/files list]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

export async function createUpload(req: NextRequest, ownerId: string, resolve: ScopeResolver): Promise<Response> {
  const s = await scopeFor(req, ownerId, resolve, "write")
  if (s instanceof Response) return s
  if (!r2Configured()) return NextResponse.json({ error: "file storage not configured" }, { status: 503 })

  const v = validateUploadIntent(await req.json().catch(() => null))
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { name, mime, size } = v.intent
  const { scope, cred } = s

  try {
    const fileId = newId()
    let key: string
    try {
      key = objectKey({ workspaceId: scope.workspaceId, kind: scope.kind, ownerId, fileId, name, mime })
    } catch {
      return NextResponse.json({ error: "invalid id" }, { status: 400 })
    }
    const inserted = await query(
      `INSERT INTO dashboard.workspace_files
         (id, workspace_id, ${COLUMN[scope.kind]}, key, name, mime, size, status, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
       RETURNING *`,
      [fileId, scope.workspaceId, ownerId, key, name, mime, size, requesterKey(requesterFrom(req, cred))],
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
    console.error("[workspace/files create]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

/**
 * HEADs the object: it must exist, match the declared size exactly and carry
 * the declared content type (signed into the presigned PUT). Match → ready.
 * Mismatch → object deleted, row failed. Only the uploader may complete, and
 * only while pending; repeating it on a ready file is a no-op 200.
 */
export async function completeUpload(req: NextRequest, ownerId: string, fileId: string, resolve: ScopeResolver): Promise<Response> {
  const s = await scopeFor(req, ownerId, resolve, "write")
  if (s instanceof Response) return s
  const { scope, cred } = s
  try {
    const row = await loadFile(scope, fileId)
    if (!row) return NextResponse.json({ error: "file not found" }, { status: 404 })
    const me = requesterFrom(req, cred)
    if (row.uploaded_by !== requesterKey(me)) return forbidden()
    if (row.status === "ready" || row.status === "ingested") return NextResponse.json({ file: fileFromRow(row) })
    if (row.status !== "pending") return NextResponse.json({ error: "upload failed, start again" }, { status: 409 })

    const key = String(row.key)
    const head = await headObject(key)
    if (!head) return NextResponse.json({ error: "upload not received yet" }, { status: 409 })

    if (head.size !== Number(row.size) || head.mime !== String(row.mime)) {
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
    await logActivity(scope, cred, me.agentType, "file.uploaded", fileId, `${me.name} uploaded ${file.name}`)
    // Read it for the room's agents now (P3), then tell the room: a note
    // always, plus a summary by the lead agent when the file had text (P4).
    if (scope.kind === "room") {
      const who = me.kind === "user" ? me.name.split("@")[0] : me.name
      void (async () => {
        await ingestRoomFiles(ownerId)
        if (await fileHasText(ownerId, fileId)) await onFileAdded(ownerId, file.name, who)
        else await postSystemNote(ownerId, `${who} added ${file.name}.`)
      })().catch((e) => console.error("[workspace/files announce]", fileId, e))
    }
    return NextResponse.json({ file })
  } catch (e) {
    console.error("[workspace/files complete]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

/** { url } presigned download (60 s, attachment). */
export async function downloadFile(req: NextRequest, ownerId: string, fileId: string, resolve: ScopeResolver): Promise<Response> {
  const s = await scopeFor(req, ownerId, resolve, "read")
  if (s instanceof Response) return s
  try {
    const row = await loadFile(s.scope, fileId)
    if (!row || (row.status !== "ready" && row.status !== "ingested"))
      return NextResponse.json({ error: "file not found" }, { status: 404 })
    const url = await presignGet(String(row.key), String(row.name))
    return NextResponse.json({ url, expiresIn: R2_TTL.get })
  } catch (e) {
    console.error("[workspace/files download]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}

/**
 * Soft delete: uploader, or anyone with canManage. The object stays in R2 so
 * restore remains possible; a purge job is later work.
 */
export async function removeFile(req: NextRequest, ownerId: string, fileId: string, resolve: ScopeResolver): Promise<Response> {
  const s = await scopeFor(req, ownerId, resolve, "write")
  if (s instanceof Response) return s
  const { scope, cred } = s
  try {
    const row = await loadFile(scope, fileId)
    if (!row) return NextResponse.json({ error: "file not found" }, { status: 404 })
    const me = requesterFrom(req, cred)
    if (!scope.canManage && row.uploaded_by !== requesterKey(me)) return forbidden()
    await query(`UPDATE dashboard.workspace_files SET deleted_at = now(), updated_at = now() WHERE id = $1`, [fileId])
    if (scope.kind === "room") await dropFileChunks(ownerId, fileId)
    await logActivity(scope, cred, me.agentType, "file.deleted", fileId, `${me.name} removed ${String(row.name)}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[workspace/files remove]", e)
    return NextResponse.json({ error: "db" }, { status: 500 })
  }
}
