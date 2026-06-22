import { NextRequest, NextResponse } from 'next/server'
import type {
  WorkflowGenerationResult,
  WorkflowStep,
  WorkflowStepType,
  AivoryWorkflowEdge,
} from '@/types/workflows'

/**
 * POST /api/workflows/ai-suggest
 *
 * "Design Workflow" mode in the AI Console. Natural-language intent ->
 *   1) VPS bridge /workflows/generate  (LLM produces structured steps)
 *   2) VPS bridge /workflows/draft-test (n8n-as-code BUILD + grounded node
 *      resolution via @n8n-as-code/skills + a validation/test pass)
 * so the generated workflow is built with the CORRECT n8n node types and any
 * validation issues are surfaced at generate time (not just at the test stage).
 *
 * Request:  { intent: string, availableApps?: string[], useConnections?: boolean }
 * Response: WorkflowGenerationResult { spec, edges, notes }
 */
export const runtime = 'nodejs'
export const maxDuration = 300

const VPS_BRIDGE_URL = (
  process.env.VPS_BRIDGE_URL ||
  process.env.NEXT_PUBLIC_VPS_BRIDGE_URL ||
  'http://host.docker.internal:3003'
).replace(/\/$/, '')

const TIMEOUT_MS = 120_000

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const intent = (body?.intent ?? '').toString().trim()
  if (!intent) {
    return NextResponse.json({ error: 'intent is required' }, { status: 400 })
  }

  try {
    // 1) LLM generation -> structured steps
    const upstream = await fetch(`${VPS_BRIDGE_URL}/workflows/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent,
        entrypoint: 'workflow_generate',
        availableApps: Array.isArray(body?.availableApps) ? body.availableApps : [],
        useConnections: Boolean(body?.useConnections),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Workflow engine returned ${upstream.status}` },
        { status: 502 },
      )
    }

    const data = await upstream.json().catch(() => ({}))
    const wf = (data?.workflow ?? data ?? {}) as Record<string, any>
    const rawSteps: any[] = Array.isArray(wf.steps) ? wf.steps : []
    const workflowName = (wf.workflowName ?? wf.name ?? 'Generated Workflow').toString()

    // 2) n8n-as-code build + grounded node resolution + validation (non-fatal)
    let inspection: any[] = []
    const validationWarnings: string[] = []
    let built = false
    if (rawSteps.length > 0) {
      try {
        const dt = await fetch(`${VPS_BRIDGE_URL}/workflows/draft-test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: workflowName, steps: rawSteps }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (dt.ok) {
          const dtData = await dt.json().catch(() => ({} as any))
          inspection = Array.isArray(dtData?.inspectionReport?.steps)
            ? dtData.inspectionReport.steps
            : []
          built = Boolean(dtData?.draftArtifactPath)
          const errs: any[] = Array.isArray(dtData?.dummyTest?.errors)
            ? dtData.dummyTest.errors
            : []
          for (const e of errs.slice(0, 6)) {
            validationWarnings.push(typeof e === 'string' ? e : JSON.stringify(e))
          }
        }
      } catch {
        /* validation is best-effort; generation still returns the spec */
      }
    }

    const steps: WorkflowStep[] = rawSteps.map((s, i) => {
      const insp = inspection[i] || {}
      const n8nNodeType =
        insp.nodeType ||
        insp?.selectedNode?.workflowNodeType ||
        insp?.n8nInspection?.selectedWorkflowNodeType ||
        null
      return {
        id: (s?.id ?? `step-${i + 1}`).toString(),
        type: ((s?.type as WorkflowStepType) || (i === 0 ? 'trigger' : 'action')),
        appId: (s?.appId ?? s?.app ?? s?.app_id ?? s?.service ?? 'generic').toString(),
        actionId: (s?.actionId ?? s?.action ?? s?.action_id ?? s?.operation ?? '').toString(),
        connectionId: (s?.connectionId ?? '').toString(),
        inputs: {
          ...((s?.inputs ?? s?.config ?? s?.parameters ?? {}) as Record<string, any>),
          ...(n8nNodeType ? { _n8nNodeType: n8nNodeType } : {}),
        },
        position: { x: 240, y: 80 + i * 160 },
        ...(s?.agentId ? { agentId: s.agentId.toString() } : {}),
        ...(s?.agentName ? { agentName: s.agentName.toString() } : {}),
      }
    })

    const edges: AivoryWorkflowEdge[] = steps
      .slice(1)
      .map((s, i) => ({ from: steps[i].id, to: s.id }))

    const result: WorkflowGenerationResult = {
      spec: {
        name: workflowName,
        description: (wf.summary ?? '').toString(),
        source: 'console',
        intent,
        steps,
      },
      edges,
      notes: {
        summary: (wf.summary ?? data?.message ?? '').toString(),
        assumptions: built ? ['Built and validated with n8n-as-code.'] : [],
        warnings: [
          ...(rawSteps.length === 0
            ? ['The AI did not return structured steps for this intent — try a more specific prompt.']
            : []),
          ...validationWarnings,
        ],
      },
    }

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to generate workflow'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
