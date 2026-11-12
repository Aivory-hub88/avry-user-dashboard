import { requirePaidPlan } from '@/lib/planGate'
import { NextRequest, NextResponse } from 'next/server'
import { listVersions, snapshotVersion, type VersionTriggerReason } from '@/lib/workflows/versionRepository'
import { getAuthUser } from '@/lib/serverAuth'
import type { AivoryWorkflowSpec } from '@/types/workflow'
import type { CanvasState } from '@/lib/workflows/canvasRepository'
import { requireModule } from '@/lib/teamAccess'
import { authorizeWorkflow } from '@/lib/workflows/access'

// GET  /api/workflows/:id/versions — list version snapshots, newest first.
// POST /api/workflows/:id/versions — client-triggered snapshot of the
// CURRENT (pre-change) spec/canvas, called from app/workflows/page.tsx right
// before the four mutation points that actually warrant a version (AI
// apply-to-existing, manual step/status/title edits) — deliberately NOT
// wired into the 800ms-debounced canvas autosave, which would be far too
// noisy for version history.
//
// Unauthenticated (matches app/api/workflows/route.ts and the rest of this
// draft-workflow storage today) — user_id on each row is best-effort only,
// attached when a valid token happens to be present.

export const runtime = 'nodejs'

function bestEffortUserId(request: NextRequest): string | null {
  try {
    return getAuthUser(request)?.user_id ?? null
  } catch {
    return null
  }
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  // Paid plans only: free accounts cannot build, run or deploy workflows.
  const planGate = await requirePaidPlan(_request, 'workflows')
  if (!planGate.ok) return planGate.response

  const denied = await requireModule(_request, 'workflows')
  if (denied) return denied

  const { id } = await ctx.params

  const wfAuth = await authorizeWorkflow(_request, id, 'read')

  if (!wfAuth.ok) return wfAuth.res
  try {
    const versions = await listVersions(id)
    return NextResponse.json(versions)
  } catch (err) {
    console.error(`[GET /api/workflows/${id}/versions]`, err)
    return NextResponse.json({ error: 'Version history unavailable' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  // Paid plans only: free accounts cannot build, run or deploy workflows.
  const planGate = await requirePaidPlan(request, 'workflows')
  if (!planGate.ok) return planGate.response

  const denied = await requireModule(request, 'workflows')
  if (denied) return denied

  const { id } = await ctx.params

  const wfAuth = await authorizeWorkflow(request, id, 'write')

  if (!wfAuth.ok) return wfAuth.res
  let body: { spec?: AivoryWorkflowSpec; canvas?: CanvasState | null; reason?: VersionTriggerReason }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.spec || !body.reason) {
    return NextResponse.json({ error: 'spec and reason are required' }, { status: 400 })
  }

  await snapshotVersion(id, body.spec, body.canvas ?? null, body.reason, bestEffortUserId(request))
  return NextResponse.json({ success: true })
}
