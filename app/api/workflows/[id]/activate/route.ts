import { NextRequest, NextResponse } from 'next/server'
import { workflowRepository } from '@/lib/workflows/repository'
import type { AivoryWorkflowSpec } from '@/types/workflow'
import { requireModule } from '@/lib/teamAccess'
import { authorizeWorkflow } from '@/lib/workflows/access'

// POST /api/workflows/:id/activate — flips Aivory's own `status` to
// 'active'. Built for WorkflowRepository interface parity; nothing in the
// UI currently calls this (real n8n deployment goes through the separate
// flat /api/workflows/activate route, which receives n8n credentials
// directly). If the store has no record for `id` yet, the client may send
// `{ spec }` as a recovery payload — upsert it first so activation doesn't
// 404 on a workflow that was created client-side before this route existed.

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const denied = await requireModule(request, 'workflows')
  if (denied) return denied

  const { id } = await ctx.params
  const auth = await authorizeWorkflow(request, id, 'write')
  if (!auth.ok) return auth.res
  let body: { spec?: AivoryWorkflowSpec } = {}
  try {
    body = await request.json()
  } catch {
    // empty/invalid body is fine — activation doesn't require one
  }

  try {
    let existing = workflowRepository.get(id)
    if (!existing && body.spec) {
      existing = workflowRepository.upsert({ ...body.spec, id, owner: auth.actor.userId, workspace_id: null })
    }
    if (!existing) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })

    const updated = workflowRepository.update(id, { status: 'active' }) ?? existing
    return NextResponse.json(updated)
  } catch (err) {
    console.error(`[POST /api/workflows/${id}/activate]`, err)
    return NextResponse.json({ error: 'Failed to activate workflow' }, { status: 500 })
  }
}
