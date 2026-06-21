import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/console/workflows/from-blueprint
 * Create a draft workflow handoff record seeded from a blueprint, which the
 * Workflow tab then opens and the user can generate/refine.
 * Body:   { blueprintId, name?, context? }
 * Returns { data: ConsoleWorkflow }
 */
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const blueprintId = (body?.blueprintId ?? '').toString()

    if (!blueprintId) {
      return NextResponse.json({ error: 'blueprintId is required' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const data = {
      id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: (body?.name ?? 'Workflow from blueprint').toString(),
      source: 'blueprint',
      status: 'draft',
      blueprintId,
      description: body?.context?.description ?? undefined,
      createdAt: now,
      updatedAt: now,
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create workflow from blueprint' },
      { status: 500 },
    )
  }
}
