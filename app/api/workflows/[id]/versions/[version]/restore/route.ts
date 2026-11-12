import { requirePaidPlan } from '@/lib/planGate'
import { NextRequest, NextResponse } from 'next/server'
import { workflowRepository } from '@/lib/workflows/repository'
import { canvasRepository } from '@/lib/workflows/canvasRepository'
import { getVersion, snapshotVersion } from '@/lib/workflows/versionRepository'
import { requireModule } from '@/lib/teamAccess'
import { authorizeWorkflow } from '@/lib/workflows/access'

// POST /api/workflows/:id/versions/:version/restore — reapplies a stored
// snapshot's spec+canvas as the workflow's current state, then immediately
// snapshots the result as a NEW version tagged 'restore'. Restoring never
// destructively drops history — the version you restored FROM is still
// there, and the version you restored TO becomes the new latest entry, so
// restoring again later can undo this restore too.

export const runtime = 'nodejs'

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; version: string }> }
) {
  // Paid plans only: free accounts cannot build, run or deploy workflows.
  const planGate = await requirePaidPlan(_request, 'workflows')
  if (!planGate.ok) return planGate.response

  const denied = await requireModule(_request, 'workflows')
  if (denied) return denied

  const { id, version: versionParam } = await ctx.params

  const wfAuth = await authorizeWorkflow(_request, id, 'write')

  if (!wfAuth.ok) return wfAuth.res
  const version = parseInt(versionParam, 10)
  if (!Number.isFinite(version)) {
    return NextResponse.json({ error: 'Invalid version number' }, { status: 400 })
  }

  try {
    const snapshot = await getVersion(id, version)
    if (!snapshot) return NextResponse.json({ error: 'Version not found' }, { status: 404 })

    // A snapshot must never change who owns the workflow or where it is shared.
    const { id: _specId, createdAt: _createdAt, owner: _owner, workspace_id: _ws, ...specPatch } = snapshot.spec as any
    const updated = workflowRepository.update(id, specPatch)
    if (!updated) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })

    if (snapshot.canvas) {
      canvasRepository.set(id, snapshot.canvas.nodes as any, snapshot.canvas.edges as any)
    }

    await snapshotVersion(id, updated, snapshot.canvas, 'restore')

    return NextResponse.json({ spec: updated, canvas: snapshot.canvas })
  } catch (err) {
    console.error(`[POST /api/workflows/${id}/versions/${versionParam}/restore]`, err)
    return NextResponse.json({ error: 'Failed to restore version' }, { status: 500 })
  }
}
