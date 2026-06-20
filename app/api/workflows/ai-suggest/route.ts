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
 * "Design Workflow" mode in the AI Console. Takes a natural-language intent and
 * asks the VPS Bridge (Zeroclaw-orchestrated) to generate an automation, then
 * maps the result into the dashboard's WorkflowGenerationResult shape so the
 * console can preview it and hand it off to the Workflow tab.
 *
 * Request:  { intent: string, availableApps?: string[], useConnections?: boolean }
 * Response: WorkflowGenerationResult { spec, edges, notes }
 */
export const runtime = 'nodejs'

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

    const steps: WorkflowStep[] = rawSteps.map((s, i) => ({
      id: (s?.id ?? `step-${i + 1}`).toString(),
      type: ((s?.type as WorkflowStepType) || (i === 0 ? 'trigger' : 'action')),
      appId: (s?.appId ?? s?.app ?? s?.app_id ?? s?.service ?? 'generic').toString(),
      actionId: (s?.actionId ?? s?.action ?? s?.action_id ?? s?.operation ?? '').toString(),
      connectionId: (s?.connectionId ?? '').toString(),
      inputs: (s?.inputs ?? s?.config ?? s?.parameters ?? {}) as Record<string, any>,
      position: { x: 240, y: 80 + i * 160 },
      ...(s?.agentId ? { agentId: s.agentId.toString() } : {}),
      ...(s?.agentName ? { agentName: s.agentName.toString() } : {}),
    }))

    const edges: AivoryWorkflowEdge[] = steps
      .slice(1)
      .map((s, i) => ({ from: steps[i].id, to: s.id }))

    const result: WorkflowGenerationResult = {
      spec: {
        name: (wf.workflowName ?? wf.name ?? 'Generated Workflow').toString(),
        description: (wf.summary ?? '').toString(),
        source: 'console',
        intent,
        steps,
      },
      edges,
      notes: {
        summary: (wf.summary ?? data?.message ?? '').toString(),
        assumptions: [],
        warnings:
          rawSteps.length === 0
            ? ['The AI did not return structured steps for this intent — try a more specific prompt.']
            : [],
      },
    }

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to generate workflow'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
