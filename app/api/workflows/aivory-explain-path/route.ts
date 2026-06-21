import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/workflows/aivory-explain-path
 * Explain, in plain language, the path/logic leading to a given step.
 * Body:   { workflow, targetStepId }
 * Returns ExplainPathResult { summary, steps: [{ stepId, explanation }] }
 *
 * Streams from the bridge /console/stream (Zeroclaw) and buffers the SSE.
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
    const targetStepId = (body?.targetStepId ?? '').toString()

    if (!targetStepId) {
      return NextResponse.json({ error: 'targetStepId is required' }, { status: 400 })
    }

    const prompt =
      `Explain in plain language how this automation reaches the step "${targetStepId}". ` +
      `Give a one-paragraph summary, then a short explanation for each preceding step. ` +
      `Workflow JSON:\n${JSON.stringify(workflow).slice(0, 8000)}`

    const r = await fetch(`${BRIDGE}/console/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, session_id: `explain-${Date.now()}` }),
      signal: AbortSignal.timeout(115_000),
    })

    if (!r.ok) {
      return NextResponse.json({ error: `Explain engine returned ${r.status}` }, { status: 502 })
    }

    // Buffer the SSE chunks into a single text
    const sse = await r.text()
    let text = ''
    for (const line of sse.split('\n')) {
      if (!line.startsWith('data: ')) continue
      try {
        const evt = JSON.parse(line.slice(6))
        if (evt && typeof evt.content === 'string') text += evt.content
      } catch {
        /* ignore */
      }
    }
    text = text.trim() || 'No explanation available.'

    const steps = Array.isArray(workflow?.steps)
      ? workflow.steps
          .map((s: any) => ({ stepId: (s?.id ?? '').toString(), explanation: '' }))
          .filter((s: any) => s.stepId)
      : [{ stepId: targetStepId, explanation: text }]

    return NextResponse.json({ summary: text, steps })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to explain workflow path' },
      { status: 500 },
    )
  }
}
