/**
 * API Route: GET /api/blueprints/result/[jobId]
 *
 * Polls the VPS bridge for a blueprint generation job enqueued by
 * POST /api/blueprints/generate. Applies the same parsing/fallback/ROI-
 * override logic the old synchronous route used to apply inline — see
 * lib/blueprintGeneration.ts for why that logic lives there now, shared by
 * both routes.
 */

import { NextRequest } from 'next/server'
import { getConfig } from '@/lib/config'
import { createErrorResponse } from '@/types/errors'
import { parseBlueprintContent, deriveEstimatedRoiMonths, buildBlueprintFromText } from '@/lib/blueprintGeneration'

export const maxDuration = 30

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  if (!jobId) {
    return Response.json(createErrorResponse('ValidationError', 'jobId is required'), { status: 400 })
  }

  const config = getConfig()

  let response: Response
  try {
    response = await fetch(`${config.VPS_BRIDGE_URL}/blueprint/result/${encodeURIComponent(jobId)}`, {
      method: 'GET',
    })
  } catch (error) {
    console.error('[API] VPS Bridge unreachable (blueprint result poll):', error instanceof Error ? error.message : error)
    return Response.json(
      createErrorResponse('NetworkError', `VPS Bridge is not reachable at ${config.VPS_BRIDGE_URL}.`),
      { status: 503 }
    )
  }

  if (response.status === 404) {
    return Response.json(createErrorResponse('NotFoundError', 'Blueprint job not found'), { status: 404 })
  }

  const payload = await response.json().catch(() => null)
  if (!payload) {
    return Response.json(
      createErrorResponse('ServiceError', 'The blueprint service returned an invalid response. Please try again.'),
      { status: 502 }
    )
  }

  // Still running -> tell the client to keep polling.
  if (payload.status && payload.status !== 'completed') {
    if (payload.status === 'failed') {
      return Response.json(
        createErrorResponse('GenerationError', payload.message || 'Blueprint generation failed. Please try again.'),
        { status: 502 }
      )
    }
    return Response.json({ jobStatus: payload.status }) // waiting | active | delayed
  }

  // Completed — same parse/fallback/ROI-override sequence the old synchronous
  // route applied before returning.
  const content: string = payload.result?.content || ''
  const diagnostic = payload.result?.diagnostic

  if (!content) {
    return Response.json(
      createErrorResponse('GenerationError', 'Blueprint generation failed. Please try again.'),
      { status: 502 }
    )
  }

  const parsed = parseBlueprintContent(content)
  if (parsed) {
    // Architecture Principle 2 ("the LLM never computes... must never be
    // the source of a number that reaches the page") — enforced here, not
    // just requested in the prompt, so it holds regardless of what the
    // model actually returned. See §1.6 row 11 of
    // DEEP-DIAGNOSTIC-EXPERIENCE-V2-PLANNING.md.
    if (parsed.deployment_plan) {
      parsed.deployment_plan.estimated_roi_months = deriveEstimatedRoiMonths(diagnostic)
    }
    return Response.json({ jobStatus: 'completed', ...parsed })
  }

  // The model returned prose instead of JSON — salvage what we can, but mark
  // the result so the UI can tell the user this is a simplified fallback
  // rather than a full AI-generated blueprint.
  const fallback = buildBlueprintFromText(content, diagnostic)
  return Response.json({ jobStatus: 'completed', ...fallback, fallback_generated: true })
}
