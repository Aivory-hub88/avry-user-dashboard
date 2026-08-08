/**
 * API Route: POST /api/blueprints/generate
 *
 * Enqueues a blueprint generation job on the VPS bridge and returns a job_id
 * immediately. The frontend then polls /api/blueprints/result/[jobId] for
 * completion. Blueprint generation itself can legitimately take 1-5+ minutes,
 * which is longer than Cloudflare's ~100-120s edge proxy timeout can survive
 * on a single held connection — this enqueue+poll split (2026-08-09) is the
 * same pattern services/deepDiagnostic.ts already uses for the Deep
 * Diagnostic (see app/api/diagnostics/run/route.ts). This route itself must
 * stay fast; it does no LLM work.
 *
 * Requirements: 1.1, 1.2, 4.1, 4.2, 5.3, 5.6, 5.8
 */

import { NextRequest } from 'next/server'
import { getConfig } from '@/lib/config'
import { createErrorResponse } from '@/types/errors'
import { buildBlueprintPrompt } from '@/lib/blueprintGeneration'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json() as { diagnostic?: any; diagnostic_data?: any; locale?: 'en' | 'id' }
    const diagnostic = body.diagnostic || body.diagnostic_data
    const locale = body.locale === 'id' ? 'id' : 'en'

    if (!diagnostic) {
      return Response.json(
        createErrorResponse(
          'ValidationError',
          'Missing required fields',
          {
            required: ['diagnostic'],
            received: Object.keys(body)
          }
        ),
        { status: 400 }
      )
    }

    const config = getConfig()
    const prompt = buildBlueprintPrompt(diagnostic, locale)

    // Enqueue on the VPS Bridge (returns a job_id immediately, no long wait).
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15_000)

    let response: Response
    try {
      response = await fetch(`${config.VPS_BRIDGE_URL}/blueprint/generate/async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          diagnostic,
        }),
        signal: controller.signal,
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return Response.json(
          createErrorResponse('TimeoutError', 'Could not reach the blueprint service. Please try again.'),
          { status: 504 }
        )
      }
      throw err
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'VPS bridge request failed' }))
      return Response.json(
        createErrorResponse(
          errorData.error || 'ServiceError',
          errorData.message || 'VPS bridge request failed',
          errorData.details
        ),
        { status: response.status }
      )
    }

    const data = await response.json().catch(() => null)
    if (!data || !data.job_id) {
      return Response.json(
        createErrorResponse('ServiceError', 'The blueprint service did not return a job id. Please try again.'),
        { status: 502 }
      )
    }

    return Response.json({ status: 'queued', job_id: data.job_id }, { status: 202 })

  } catch (error) {
    // Handle configuration errors
    if (error instanceof Error && error.message.includes('Missing required environment variables')) {
      return Response.json(
        createErrorResponse(
          'ConfigurationError',
          'Server configuration error',
          { message: error.message }
        ),
        { status: 500 }
      )
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return Response.json(
        createErrorResponse(
          'NetworkError',
          'Service temporarily unavailable. Please try again.',
          { message: error.message }
        ),
        { status: 503 }
      )
    }

    // Handle unexpected errors
    console.error('Blueprint enqueue error:', error)
    return Response.json(
      createErrorResponse(
        'InternalError',
        'An unexpected error occurred',
        { message: error instanceof Error ? error.message : 'Unknown error' }
      ),
      { status: 500 }
    )
  }
}
