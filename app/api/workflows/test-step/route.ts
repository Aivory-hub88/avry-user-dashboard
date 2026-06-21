import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/workflows/test-step
 * Validate a single step's configuration and return a preview result the
 * inspector shows in its Output tab.
 * Body:   { nodeId, config }
 * Returns { success, nodeId, output, message }
 *
 * NOTE: this performs static validation + echoes the resolved config. Live
 * execution of an individual node against real credentials is not wired up
 * yet, so we return a deterministic preview rather than a fake run result.
 */
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const nodeId = (body?.nodeId ?? '').toString()
    const config = body?.config ?? {}

    if (!nodeId) {
      return NextResponse.json({ success: false, error: 'nodeId is required' }, { status: 400 })
    }

    const missing: string[] = []
    if (config && typeof config === 'object') {
      for (const [k, v] of Object.entries(config as Record<string, unknown>)) {
        if (v === '' || v === null || v === undefined) missing.push(k)
      }
    }

    if (missing.length) {
      return NextResponse.json({
        success: false,
        nodeId,
        message: `Missing or empty configuration: ${missing.join(', ')}`,
        output: { config },
      })
    }

    return NextResponse.json({
      success: true,
      nodeId,
      message: 'Step configuration is valid (preview — live execution runs on activation).',
      output: { config },
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Test failed' },
      { status: 500 },
    )
  }
}
