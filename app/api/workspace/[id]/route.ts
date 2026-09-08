import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { workspaceCredential, unauthorized, forbidden } from '@/lib/workspaceAuth'
import { getDocRole, canWrite } from '@/lib/workspaceAccess'

export const runtime = 'nodejs'

// PATCH /api/workspace/[id] — rename (title). Owner/editor only.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const role = await getDocRole(cred, id)
  if (!canWrite(role)) return forbidden()
  let body: { title?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const title = (body.title ?? '').toString().slice(0, 200).trim()
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })
  try {
    await query(
      `UPDATE dashboard.workspace_docs SET title = $2, updated_at = now() WHERE id = $1 OR id = $3`,
      [`workspace:${id}`, title, id],
    )
    return NextResponse.json({ id, title })
  } catch (e) {
    console.error('[workspace rename]', e)
    return NextResponse.json({ error: 'db' }, { status: 500 })
  }
}

// DELETE /api/workspace/[id] — owner/admin only. Removes rows + ACL + requests.
// Note: collab in-memory rooms are NOT purged; a still-open client that writes
// afterwards will re-create the rows as a new doc (accepted MVP behavior).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const role = await getDocRole(cred, id)
  const isOwner = role === 'owner'
  if (!isOwner) return forbidden()
  try {
    await query(
      `DELETE FROM dashboard.workspace_docs WHERE id = ANY($1::text[])`,
      [[id, `workspace:${id}`, `workspace:db:${id}`, `db:${id}`]],
    )
    await query(`DELETE FROM dashboard.workspace_doc_acl WHERE doc_id = $1`, [id])
    await query(`DELETE FROM dashboard.workspace_access_requests WHERE doc_id = $1`, [id])
    return NextResponse.json({ ok: true, id })
  } catch (e) {
    console.error('[workspace delete]', e)
    return NextResponse.json({ error: 'db' }, { status: 500 })
  }
}
