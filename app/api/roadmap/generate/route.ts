/**
 * API Route: POST /api/roadmap/generate
 *
 * Enqueues a roadmap generation job on the VPS bridge and returns a job_id
 * immediately. The frontend polls /api/roadmap/result/[jobId] for the result.
 *
 * 2026-08-25: this route used to hold the HTTP request open through the
 * bridge's /console/stream while the model generated (70s+ measured live,
 * hard 90/95s timeouts) and silently swapped in a generic template whenever
 * the timeouts fired under load. Now it's the same enqueue+poll pattern
 * blueprints use — see AVRY/vps-bridge/lib/roadmapQueue.js for the
 * generation ladder and lib/roadmapGeneration.ts for the shared prompt/
 * parsing/fallback logic. This route does no LLM work and stays fast.
 */

import { NextRequest } from 'next/server'
import { SERVICES } from '@/config/services'
import { buildRoadmapPrompt } from '@/lib/roadmapGeneration'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const source: string = body.source ?? 'direct'
    const blueprintId: string | undefined = body.blueprintId
    const diagnosticContext: Record<string, any> = body.diagnosticContext ?? {}
    const blueprintContext: Record<string, any> = body.blueprintContext ?? {}
    const locale: 'en' | 'id' = body.locale === 'id' ? 'id' : 'en'

    const prompt = buildRoadmapPrompt(diagnosticContext, blueprintContext, locale)

    // Enqueue on the VPS Bridge (returns a job_id immediately, no long wait).
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15_000)

    let response: Response
    try {
      response = await fetch(`${SERVICES.VPS_BRIDGE}/roadmap/generate/async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          context: { source, blueprintId, diagnosticContext, blueprintContext, locale },
        }),
        signal: controller.signal,
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return Response.json(
          { success: false, error: 'Could not reach the roadmap service. Please try again.' },
          { status: 504 },
        )
      }
      throw err
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'VPS bridge request failed' }))
      return Response.json(
        { success: false, error: errorData.message || 'VPS bridge request failed' },
        { status: response.status },
      )
    }

    const data = await response.json().catch(() => null)
    if (!data || !data.job_id) {
      return Response.json(
        { success: false, error: 'The roadmap service did not return a job id. Please try again.' },
        { status: 502 },
      )
    }

    return Response.json({ success: true, status: 'queued', job_id: data.job_id }, { status: 202 })
  } catch (err: any) {
    console.error('[roadmap/generate] enqueue error:', err)
    return Response.json(
      { success: false, error: err?.message ?? 'Failed to generate roadmap' },
      { status: 500 },
    )
  }
}
