import { NextRequest, NextResponse } from 'next/server'
import { workflowRepository } from '@/lib/workflows/repository'
import { AivoryWorkflowSpec } from '@/types/workflow'
import { requireModule } from '@/lib/teamAccess'
import { authorizeWorkflow, canShareInto, describeForActor } from '@/lib/workflows/access'

// GET /api/workflows/:id — fetch a single workflow.
// PATCH /api/workflows/:id — partial update (title/status/steps/etc).
// DELETE /api/workflows/:id — remove.
//
// workflowRepository.get/update/remove already existed with zero callers —
// the client (hooks/useWorkflows.ts) has been targeting these exact routes
// since before this file existed; every call 404'd silently, masked by a
// localStorage fallback. Unauthenticated, matching app/api/workflows/route.ts
// (no per-user scoping anywhere in this store yet — not introduced here).

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const denied = await requireModule(_request, 'workflows')
  if (denied) return denied

  const { id } = await ctx.params
  const auth = await authorizeWorkflow(_request, id, 'read')
  if (!auth.ok) return auth.res
  try {
    const workflow = auth.spec
    if (!workflow) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    return NextResponse.json((await describeForActor([workflow], auth.actor))[0])
  } catch (err) {
    console.error(`[GET /api/workflows/${id}]`, err)
    return NextResponse.json({ error: 'Failed to fetch workflow' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const denied = await requireModule(request, 'workflows')
  if (denied) return denied

  const { id } = await ctx.params
  let patch: Partial<Omit<AivoryWorkflowSpec, 'id' | 'createdAt'>>
  try {
    patch = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const auth = await authorizeWorkflow(request, id, 'write')
  if (!auth.ok) return auth.res
  // Ownership is never client-settable; only the owner can move a workflow
  // into (or out of) a team, and only into a team they can edit in.
  const requested = patch.workspace_id
  delete (patch as { owner?: unknown }).owner
  delete (patch as { created_by?: unknown }).created_by
  delete (patch as { access?: unknown }).access
  delete (patch as { workspace_id?: unknown }).workspace_id
  if (requested !== undefined) {
    const isOwner = !auth.spec || auth.spec.owner === auth.actor.userId || (!auth.spec.owner && auth.actor.superadmin)
    if (!isOwner) return NextResponse.json({ error: 'only the owner can share a workflow' }, { status: 403 })
    if (requested !== null && !canShareInto(auth.actor, String(requested)))
      return NextResponse.json({ error: 'you cannot share into that team' }, { status: 403 })
    patch.workspace_id = requested === null ? null : String(requested)
  }
  try {
    const updated = workflowRepository.update(id, patch)
    if (!updated) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    return NextResponse.json(updated)
  } catch (err) {
    console.error(`[PATCH /api/workflows/${id}]`, err)
    return NextResponse.json({ error: 'Failed to update workflow' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const denied = await requireModule(_request, 'workflows')
  if (denied) return denied

  const { id } = await ctx.params
  const auth = await authorizeWorkflow(_request, id, 'delete')
  if (!auth.ok) return auth.res
  try {
    workflowRepository.remove(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[DELETE /api/workflows/${id}]`, err)
    return NextResponse.json({ error: 'Failed to delete workflow' }, { status: 500 })
  }
}
