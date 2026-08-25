/**
 * API Route: GET /api/roadmap/result/[jobId]
 *
 * Polls the VPS bridge for a roadmap generation job enqueued by
 * POST /api/roadmap/generate. Applies the same parsing/fallback logic the
 * old synchronous route applied inline — see lib/roadmapGeneration.ts.
 *
 * Fallback semantics preserved from the synchronous route: when the AI call
 * genuinely failed, the user still receives a usable generic roadmap, but it
 * is FLAGGED (fallback_generated: true on the roadmap object itself, so the
 * flag survives localStorage/Postgres persistence) — a generic substitute
 * must never look identical to a real AI-generated roadmap.
 */

import { NextRequest } from 'next/server'
import { SERVICES } from '@/config/services'
import { parseRoadmapContent, buildFallbackRoadmap } from '@/lib/roadmapGeneration'

export const maxDuration = 30

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  if (!jobId) {
    return Response.json({ success: false, error: 'jobId is required' }, { status: 400 })
  }

  let response: Response
  try {
    response = await fetch(`${SERVICES.VPS_BRIDGE}/roadmap/result/${encodeURIComponent(jobId)}`, {
      method: 'GET',
    })
  } catch (error) {
    console.error('[API] VPS Bridge unreachable (roadmap result poll):', error instanceof Error ? error.message : error)
    return Response.json({ success: false, error: 'VPS Bridge is not reachable.' }, { status: 503 })
  }

  if (response.status === 404) {
    return Response.json({ success: false, error: 'Roadmap job not found' }, { status: 404 })
  }

  const payload = await response.json().catch(() => null)
  if (!payload) {
    return Response.json(
      { success: false, error: 'The roadmap service returned an invalid response. Please try again.' },
      { status: 502 },
    )
  }

  // Still running -> tell the client to keep polling.
  if (payload.status && payload.status !== 'completed') {
    if (payload.status === 'failed') {
      return Response.json(
        { success: false, error: payload.message || 'Roadmap generation failed. Please try again.' },
        { status: 502 },
      )
    }
    return Response.json({ jobStatus: payload.status }) // waiting | active | delayed
  }

  const content: string = payload.result?.content || ''
  const context = payload.result?.context ?? {}
  const source: string = context.source ?? 'direct'
  const blueprintId: string | undefined = context.blueprintId
  const diagnosticContext: Record<string, any> = context.diagnosticContext ?? {}
  const locale: 'en' | 'id' = context.locale === 'id' ? 'id' : 'en'

  if (content) {
    try {
      const roadmap = parseRoadmapContent(content, source, blueprintId, locale)
      return Response.json({ jobStatus: 'completed', success: true, roadmap })
    } catch (parseErr) {
      console.error('[roadmap/result] content unusable, using flagged fallback:', parseErr)
    }
  }

  // AI call failed or returned unusable output — generic roadmap, flagged.
  const fallback = buildFallbackRoadmap(source, blueprintId, diagnosticContext, locale)
  fallback.fallback_generated = true
  return Response.json({ jobStatus: 'completed', success: true, roadmap: fallback, fallback_generated: true })
}
