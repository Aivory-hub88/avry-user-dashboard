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
  let body: { title?: unknown; mode?: unknown; favorite?: unknown; tags?: unknown; props?: unknown } = {}
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
  let tags: Array<{ id: string; label: string; color: string }> | undefined
  let props: Record<string, unknown> | undefined
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
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) return NextResponse.json({ error: 'tags must be array' }, { status: 400 })
    const cleaned: Array<{ id: string; label: string; color: string }> = []
    const allowedColors = new Set(["gray","blue","green","yellow","red","purple","pink","orange"])
    for (const t of body.tags.slice(0, 20)) {
      if (!t || typeof t !== "object") continue
      const label = (t as { label?: unknown }).label?.toString().slice(0, 24).trim()
      if (!label) continue
      const id = (t as { id?: unknown }).id?.toString().slice(0, 32) || `tag-${Math.random().toString(36).slice(2, 6)}`
      const color = allowedColors.has((t as { color?: unknown }).color as string) ? (t as { color: string }).color : "gray"
      cleaned.push({ id, label, color })
    }
    tags = cleaned
    sets.push(`tags = $${nextParam++}::jsonb`)
    values.push(JSON.stringify(tags))
  }
  if (body.props !== undefined) {
    if (!body.props || typeof body.props !== "object" || Array.isArray(body.props)) {
      return NextResponse.json({ error: 'props must be object' }, { status: 400 })
    }
    // Only allow known flags; strip everything else to avoid JSON bloat.
    const allowed: Record<string, unknown> = {}
    const src = body.props as Record<string, unknown>
    if (typeof src.isJournal === "boolean") allowed.isJournal = src.isJournal
    if (typeof src.isTemplate === "boolean") allowed.isTemplate = src.isTemplate
    if (src.pageWidth === "full" || src.pageWidth === "standard") allowed.pageWidth = src.pageWidth
    if (src.edgelessTheme === "light" || src.edgelessTheme === "dark") allowed.edgelessTheme = src.edgelessTheme
    props = allowed
    sets.push(`props = $${nextParam++}::jsonb`)
    values.push(JSON.stringify(props))
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
    return NextResponse.json({ id, ...(title !== undefined ? { title } : {}), ...(mode !== undefined ? { mode } : {}), ...(favorite !== undefined ? { favorite } : {}), ...(tags !== undefined ? { tags } : {}), ...(props !== undefined ? { props } : {}) })
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
