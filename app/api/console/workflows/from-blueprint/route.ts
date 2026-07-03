import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/console/workflows/from-blueprint
 * Convert a blueprint workflow module into a draft workflow the Workflows tab
 * can open. Deterministic — the blueprint module already carries the steps
 * and integrations, so no LLM round trip is needed (instant response).
 *
 * Body (from the blueprint page's per-module "Generate" button):
 *   { workflow_id, workflow_title, workflow_steps: [{type, action}],
 *     diagnostic_context?, company_name? }
 * Legacy body (older console handoff):
 *   { blueprintId, name?, context? }
 *
 * Returns the shape the blueprint page reads:
 *   { workflow_id, title, trigger, steps: [{step, action, tool, output}],
 *     integrations, estimated_time }
 *
 * NOTE (2026-07): previously this route ONLY accepted the legacy body and
 * returned a `{ data }` stub — the blueprint page sent the module payload,
 * got `400 blueprintId is required`, and the Generate button had never
 * worked in production.
 */
export const runtime = 'nodejs'

/** Map a blueprint step type to a sensible default tool label. */
function toolForStep(type: string, integrations: string[]): string {
  const t = (type || '').toLowerCase()
  if (t === 'ingestion') return integrations[0] || 'Data source'
  if (t === 'ai_processing') return 'Aivory AI'
  if (t === 'human_review') return 'Manual review'
  if (t === 'notification') return integrations.find(i => /slack|mail|whatsapp|telegram/i.test(i)) || 'Notification channel'
  return integrations[0] || 'n8n'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    // ── Blueprint-module payload (current caller) ───────────────────────────
    const workflowSteps = Array.isArray(body?.workflow_steps) ? body.workflow_steps : null
    if (workflowSteps) {
      const title = (body?.workflow_title ?? 'Workflow from blueprint').toString()
      const integrations: string[] = Array.isArray(body?.integrations)
        ? body.integrations.map(String)
        : []

      const steps = workflowSteps.map((s: any, i: number) => ({
        step: i + 1,
        action: (s?.action ?? s?.title ?? `Step ${i + 1}`).toString(),
        tool: toolForStep((s?.type ?? '').toString(), integrations),
        output: '',
      }))

      const firstStep = workflowSteps[0]
      const trigger = firstStep && (firstStep.type === 'ingestion' || firstStep.type === 'trigger')
        ? (firstStep.action ?? 'Triggered by incoming data').toString()
        : 'Manual or scheduled start'

      return NextResponse.json({
        workflow_id: (body?.workflow_id ?? `wf-${Date.now()}`).toString(),
        title,
        trigger,
        steps,
        integrations,
        estimated_time: `${Math.max(1, Math.ceil(steps.length / 2))}h setup`,
      })
    }

    // ── Legacy console handoff payload ──────────────────────────────────────
    const blueprintId = (body?.blueprintId ?? '').toString()
    if (!blueprintId) {
      return NextResponse.json(
        { error: 'workflow_steps or blueprintId is required' },
        { status: 400 },
      )
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
