import { NextRequest, NextResponse } from 'next/server'
import { workflowRepository } from '@/lib/workflows/repository'
import { AivoryWorkflowSpec } from '@/types/workflow'

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
  const { id } = await ctx.params
  try {
    const workflow = workflowRepository.get(id)
    if (!workflow) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    return NextResponse.json(workflow)
  } catch (err) {
    console.error(`[GET /api/workflows/${id}]`, err)
    return NextResponse.json({ error: 'Failed to fetch workflow' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  let patch: Partial<Omit<AivoryWorkflowSpec, 'id' | 'createdAt'>>
  try {
    patch = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
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
  const { id } = await ctx.params
  try {
    workflowRepository.remove(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[DELETE /api/workflows/${id}]`, err)
    return NextResponse.json({ error: 'Failed to delete workflow' }, { status: 500 })
  }
}
