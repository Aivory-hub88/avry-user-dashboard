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
    // Only allow known flags + persisted DB views; strip everything else to avoid JSON bloat.
    const allowed: Record<string, unknown> = {}
    const src = body.props as Record<string, unknown>
    if (typeof src.isJournal === "boolean") allowed.isJournal = src.isJournal
    if (typeof src.isTemplate === "boolean") allowed.isTemplate = src.isTemplate
    if (src.pageWidth === "full" || src.pageWidth === "standard") allowed.pageWidth = src.pageWidth
    if (src.edgelessTheme === "light" || src.edgelessTheme === "dark") allowed.edgelessTheme = src.edgelessTheme
    // Persisted database views (saved filters/sorts) — array of lightweight view configs.
    // Kept inside props so one JSONB column holds all per-doc UI state, no extra table.
    if (Array.isArray(src.dbViews)) {
      const kinds = new Set(["table","kanban","calendar"])
      const sortFields = new Set(["title","status","priority","due","assignee"])
      const sortDirs = new Set(["asc","desc"])
      const cleanedViews: unknown[] = []
      for (const v of src.dbViews.slice(0, 10)) {
        if (!v || typeof v !== "object") continue
        const vv = v as Record<string, unknown>
        const id = vv.id?.toString().slice(0, 32) || `view-${Math.random().toString(36).slice(2, 6)}`
        const name = vv.name?.toString().slice(0, 24).trim() || "Untitled"
        const kind = kinds.has(vv.kind as string) ? (vv.kind as string) : "table"
        const statusFilter = typeof vv.statusFilter === "string" ? vv.statusFilter.slice(0, 16) : "All"
        const priorityFilter = typeof vv.priorityFilter === "string" ? vv.priorityFilter.slice(0, 16) : "All"
        const q = typeof vv.q === "string" ? vv.q.slice(0, 64) : ""
        const sortField = sortFields.has(vv.sortField as string) ? (vv.sortField as string) : "title"
        const sortDir = sortDirs.has(vv.sortDir as string) ? (vv.sortDir as string) : "asc"
        cleanedViews.push({ id, name, kind, statusFilter, priorityFilter, q, sortField, sortDir })
      }
      allowed.dbViews = cleanedViews
    } else if (src.dbViews === undefined) {
      // No change — handled below via merge below; keep existing value by not touching.
    }
    // Merge with existing row's props when caller only patches part of props:
    // fetch current props, shallow-merge, then write. This keeps other keys intact
    // when only dbViews is sent, and vice versa.
    const existingPropsRow = await query(`SELECT props FROM dashboard.workspace_docs WHERE id = $1 OR id = $2 LIMIT 1`, [`workspace:${id}`, id])
    const existingProps = (existingPropsRow.rows[0]?.props as Record<string, unknown> | null) ?? {}
    // If caller sent props, merge allowed keys over existing; if they sent e.g. only dbViews, keep other flags.
    if (body.props !== undefined) {
      // When dbViews not provided but existing has it, preserve it.
      if (allowed.dbViews === undefined && Array.isArray(existingProps.dbViews)) allowed.dbViews = existingProps.dbViews
      // Preserve other existing keys that weren't overwritten (e.g. isJournal when only dbViews patched).
      for (const k of ["isJournal","isTemplate","pageWidth","edgelessTheme"] as const) {
        if (allowed[k] === undefined && existingProps[k] !== undefined) allowed[k] = existingProps[k]
      }
    }
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
