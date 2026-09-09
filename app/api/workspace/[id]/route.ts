import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { workspaceCredential, unauthorized, forbidden } from '@/lib/workspaceAuth'
import { getDocRole, canWrite } from '@/lib/workspaceAccess'
import { recordWorkspaceActivity } from '@/lib/workspaceActivity'

export const runtime = 'nodejs'

// PATCH /api/workspace/[id] — rename (title), doc mode (page/edgeless),
// favorite/star. Owner/editor only. Partial update: only present keys change.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cred = workspaceCredential(req)
  if (!cred) return unauthorized()
  const role = await getDocRole(cred, id)
  if (!canWrite(role)) return forbidden()
  let body: { title?: unknown; mode?: unknown; favorite?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const sets: string[] = []
  const values: unknown[] = []
  let nextParam = 2
  let title: string | undefined
  let mode: string | undefined
  let favorite: boolean | undefined
  if (body.title !== undefined) {
    title = (body.title ?? '').toString().slice(0, 200).trim()
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })
    sets.push(`title = $${nextParam++}`)
    values.push(title)
  }
  if (body.mode !== undefined) {
    mode = (body.mode ?? '').toString().slice(0, 16).trim().toLowerCase()
    if (mode !== 'page' && mode !== 'edgeless') {
      return NextResponse.json({ error: 'mode must be page or edgeless' }, { status: 400 })
    }
    sets.push(`mode = $${nextParam++}`)
    values.push(mode)
  }
  if (body.favorite !== undefined) {
    if (typeof body.favorite !== 'boolean') {
      return NextResponse.json({ error: 'favorite must be boolean' }, { status: 400 })
    }
    favorite = body.favorite
    sets.push(`favorite = $${nextParam++}`)
    values.push(favorite)
  }
  if (sets.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  const idParam = nextParam++
  try {
    await query(
      `UPDATE dashboard.workspace_docs SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 OR id = $${idParam}`,
      [`workspace:${id}`, ...values, id],
    )
    if (title !== undefined) {
      await recordWorkspaceActivity({
        docId: id,
        credential: cred,
        action: 'page.renamed',
        summary: `Renamed page to “${title}”`,
        targetType: 'page',
        targetId: id,
      })
    }
    return NextResponse.json({ id, ...(title !== undefined ? { title } : {}), ...(mode !== undefined ? { mode } : {}), ...(favorite !== undefined ? { favorite } : {}) })
  } catch (e) {
    console.error('[workspace patch]', e)
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
