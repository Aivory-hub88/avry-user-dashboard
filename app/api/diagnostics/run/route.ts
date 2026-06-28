import { NextRequest, NextResponse } from 'next/server'
import { VPS_BRIDGE_CONFIG } from '@/lib/config'

// Enqueue is fast; the long LLM work runs in the bridge worker and is polled
// separately via /api/diagnostics/result/[jobId].
export const maxDuration = 30

const REQUIRED_PHASE_IDS = [
  'business_objective_kpi',
  'data_process_readiness',
  'risk_constraints',
  'ai_opportunity_mapping'
]

export async function POST(request: NextRequest) {
  // Parse request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 })
  }

  const { organization_id, mode, phases } = body as Record<string, unknown>

  if (!organization_id || typeof organization_id !== 'string') {
    return NextResponse.json(
      { message: 'organization_id is required and must be a string' },
      { status: 400 }
    )
  }
  if (mode !== 'deep') {
    return NextResponse.json({ message: 'mode must be "deep"' }, { status: 400 })
  }
  if (!phases || typeof phases !== 'object' || Array.isArray(phases)) {
    return NextResponse.json({ message: 'phases must be an object' }, { status: 400 })
  }
  const missingPhases = REQUIRED_PHASE_IDS.filter(
    id => !(id in (phases as Record<string, unknown>))
  )
  if (missingPhases.length > 0) {
    return NextResponse.json(
      { message: `phases must contain all four phase IDs. Missing: ${missingPhases.join(', ')}` },
      { status: 400 }
    )
  }

  // Enqueue on the VPS Bridge (returns a job_id immediately, no long wait).
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15_000)
  try {
    let response: Response
    try {
      response = await fetch(`${VPS_BRIDGE_CONFIG.baseUrl}/diagnostics/run/async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id, mode: 'deep', phases }),
        signal: controller.signal
      })
    } catch (fetchError: unknown) {
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json(
          { message: 'Could not reach the diagnostic service. Please try again.' },
          { status: 504 }
        )
      }
      if (fetchError instanceof TypeError) {
        console.error('[API] VPS Bridge unreachable at', VPS_BRIDGE_CONFIG.baseUrl, fetchError.message)
        return NextResponse.json(
          { message: `VPS Bridge is not reachable at ${VPS_BRIDGE_CONFIG.baseUrl}. Ensure the VPS Bridge is running on port 3003.` },
          { status: 503 }
        )
      }
      throw fetchError
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'VPS Bridge request failed' }))
      return NextResponse.json(
        { message: errorData.message || 'VPS Bridge request failed' },
        { status: response.status }
      )
    }

    const data = await response.json().catch(() => null)
    if (!data || !data.job_id) {
      return NextResponse.json(
        { message: 'The diagnostic service did not return a job id. Please try again.' },
        { status: 502 }
      )
    }

    return NextResponse.json({ status: 'queued', job_id: data.job_id }, { status: 202 })
  } catch (error) {
    console.error('[API] Deep diagnostic enqueue error:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  } finally {
    clearTimeout(timeoutId)
  }
}
