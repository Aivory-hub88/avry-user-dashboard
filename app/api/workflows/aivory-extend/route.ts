import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/workflows/aivory-extend
 * Extend a workflow with new steps after a given step, from an instruction.
 * Body:   { mode: 'EXTEND_AFTER_STEP', workflow, sourceStepId, instruction }
 * Returns { updatedWorkflow, changes[], summary[] }
 */
export const runtime = 'nodejs'
export const maxDuration = 120

const BRIDGE = (
  process.env.VPS_BRIDGE_URL ||
  process.env.NEXT_PUBLIC_VPS_BRIDGE_URL ||
  'http://host.docker.internal:3003'
).replace(/\/$/, '')

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const workflow = body?.workflow ?? {}
    const instruction = (body?.instruction ?? '').toString()

    const r = await fetch(`${BRIDGE}/workflows/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entrypoint: 'workflow_extend',
        mode: body?.mode ?? 'EXTEND_AFTER_STEP',
        intent: instruction,
        instruction,
        sourceStepId: body?.sourceStepId ?? null,
        workflow,
      }),
      signal: AbortSignal.timeout(115_000),
    })

    if (!r.ok) {
      return NextResponse.json(
        { errorMessage: `AI extend engine returned ${r.status}` },
        { status: 502 },
      )
    }

    const data = await r.json().catch(() => ({} as any))
    const wf = (data?.workflow ?? data ?? {}) as Record<string, any>
    const hasWf = wf && typeof wf === 'object' && Object.keys(wf).length > 0

    return NextResponse.json({
      updatedWorkflow: hasWf ? wf : workflow,
      changes: Array.isArray(data?.changes) ? data.changes : [],
      summary: [data?.message || wf?.summary || 'Workflow extended'],
    })
  } catch (err) {
    return NextResponse.json(
      { errorMessage: err instanceof Error ? err.message : 'AI extend failed' },
      { status: 500 },
    )
  }
}
