import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { workspaceCredential, unauthorized } from '@/lib/workspaceAuth'
import { getDocRolesBatch } from '@/lib/workspaceAccess'
import { recordWorkspaceActivity } from '@/lib/workspaceActivity'

export const runtime = 'nodejs'

function newId(): string {
  return `doc-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

type ListCursor = { u: string; id: string }

function decodeCursor(raw: string | null): ListCursor | null {
  if (!raw) return null
  try {
    const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    if (typeof decoded?.u === 'string' && typeof decoded?.id === 'string') return decoded
  } catch {}
  return null
}

function encodeCursor(c: ListCursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url')
}

export async function GET(req: NextRequest) {
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const showTrash = req.nextUrl.searchParams.get('trash') === '1'
  // Page size the caller sees after ACL filtering + dedup. Default 100 keeps
  // the old single-page behavior for workspaces under the old hard cap.
  const limit = Math.min(200, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '100', 10) || 100))
  const cursor = decodeCursor(req.nextUrl.searchParams.get('cursor'))
  // A doc can have both a bare and workspace:-prefixed row (dedup shrinks
  // the count), and ACL filtering drops rows the caller can't see (also
  // shrinks it) — so the raw fetch is padded above `limit`, and pagination
  // continues from the LAST RAW row regardless of how many survive both
  // filters. Without the padding, a plain LIMIT 100 (with no continuation)
  // silently hid every doc past the 100th with no "there's more" signal —
  // very plausible for a team active over months.
  const rawLimit = limit + 20
  try {
    const params: unknown[] = []
    let cursorSql = ''
    if (cursor) {
      params.push(cursor.u, cursor.id)
      cursorSql = `AND (updated_at, id) < ($${params.length - 1}::timestamptz, $${params.length})`
    }
    params.push(rawLimit)
    const r = await query(
      `SELECT id, workspace_id, owner, title, mode, favorite, deleted_at, updated_at, octet_length(yjs_update) as bytes
       FROM dashboard.workspace_docs
       WHERE deleted_at IS ${showTrash ? 'NOT NULL' : 'NULL'} ${cursorSql}
       ORDER BY updated_at DESC, id DESC LIMIT $${params.length}`,
      params,
    )
    const visible: any[] = []
    // Batch role resolution (3 queries total, was N×3) — see getDocRolesBatch.
    const bareIds = r.rows.map((row: any) =>
      String(row.id).replace(/^workspace:/, '').replace(/^db:/, ''),
    )
    const roles = await getDocRolesBatch(cred, bareIds)
    for (const row of r.rows) {
      const bare = (row.id as string).replace(/^workspace:/, '').replace(/^db:/, '')
      // skip the room-keyed dupe if bare also exists? keep both but dedupe by bare
      const role = roles.get(bare) ?? null
      if (role) {
        visible.push({
          id: bare,
          roomKey: row.id,
          workspace_id: row.workspace_id,
          owner: row.owner,
          title: row.title ?? bare,
          mode: 'page',
          favorite: row.favorite === true,
          deleted_at: row.deleted_at ?? null,
          updated_at: row.updated_at,
          bytes: Number(row.bytes ?? 0),
          myRole: role,
        })
      }
    }
    // dedupe by bare id keep first (most recent)
    const seen = new Set<string>()
    const deduped = visible.filter((v) => {
      if (seen.has(v.id)) return false
      seen.add(v.id)
      return true
    })
    // Cursor from the last RAW row fetched (not the deduped/visible output) —
    // the raw window may hold more rows even when this page's deduped/visible
    // count is small or zero (e.g. a run of docs the caller can't read).
    const lastRaw = r.rows[r.rows.length - 1]
    const nextCursor =
      r.rows.length === rawLimit && lastRaw ? encodeCursor({ u: String(lastRaw.updated_at), id: String(lastRaw.id) }) : null
    return NextResponse.json({ docs: deduped.slice(0, limit), nextCursor })
  } catch (e) {
    console.error('[workspace list]', e)
    return NextResponse.json({ error: 'db' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  if (cred.kind !== 'user' && cred.kind !== 'service') return unauthorized()
  const userId = cred.kind === 'service' ? 'service' : cred.user.user_id
  let body: { title?: string; id?: string; workspace_id?: string } = {}
  try {
    body = await req.json()
  } catch {}
  const id = (body.id ?? newId()).toString().slice(0, 64).replace(/[^a-zA-Z0-9-_]/g, '-')
  const title = (body.title ?? 'Untitled').toString().slice(0, 200)
  const workspaceId = (body.workspace_id ?? 'default').toString().slice(0, 64)
  try {
    await query(
      `INSERT INTO dashboard.workspace_docs (id, workspace_id, owner, title, yjs_update, updated_at)
       VALUES ($1, $2, $3, $4, ''::bytea, now())
       ON CONFLICT (id) DO NOTHING`,
      [id, workspaceId, userId, title],
    )
    // also ensure room-keyed row for collab lazy-load
    await query(
      `INSERT INTO dashboard.workspace_docs (id, workspace_id, owner, title, yjs_update, updated_at)
       VALUES ($1, $2, $3, $4, ''::bytea, now())
       ON CONFLICT (id) DO NOTHING`,
      [`workspace:${id}`, workspaceId, userId, title],
    )
    await recordWorkspaceActivity({
      docId: id,
      credential: cred,
      action: 'page.created',
      summary: `Created page “${title}”`,
      targetType: 'page',
      targetId: id,
    })
    return NextResponse.json({ id, title, workspace_id: workspaceId, owner: userId }, { status: 201 })
  } catch (e) {
    console.error('[workspace create]', e)
    return NextResponse.json({ error: 'db' }, { status: 500 })
  }
}
