import { NextRequest, NextResponse } from 'next/server'
import { VPS_BRIDGE_CONFIG } from '@/lib/config'

export const maxDuration = 120

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

  // Validate organization_id
  if (!organization_id || typeof organization_id !== 'string') {
    return NextResponse.json(
      { message: 'organization_id is required and must be a string' },
      { status: 400 }
    )
  }

  // Validate mode
  if (mode !== 'deep') {
    return NextResponse.json(
      { message: 'mode must be "deep"' },
      { status: 400 }
    )
  }

  // Validate phases is an object
  if (!phases || typeof phases !== 'object' || Array.isArray(phases)) {
    return NextResponse.json(
      { message: 'phases must be an object' },
      { status: 400 }
    )
  }

  // Validate all four phase IDs are present
  const missingPhases = REQUIRED_PHASE_IDS.filter(
    id => !(id in (phases as Record<string, unknown>))
  )
  if (missingPhases.length > 0) {
    return NextResponse.json(
      { message: `phases must contain all four phase IDs. Missing: ${missingPhases.join(', ')}` },
      { status: 400 }
    )
  }

  // Forward to VPS Bridge with 120-second timeout (deep diagnostic via OpenRouter is slow)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  try {
    let response: Response
    try {
      response = await fetch(`${VPS_BRIDGE_CONFIG.baseUrl}/diagnostics/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ organization_id, mode: 'deep', phases }),
        signal: controller.signal
      })
    } catch (fetchError: unknown) {
      // AbortError = timeout
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json(
          { message: 'Deep diagnostic timed out. The analysis is taking longer than expected — please try again.' },
          { status: 504 }
        )
      }
      // TypeError = network failure (VPS Bridge unreachable / connection refused)
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
      const errorData = await response.json().catch(() => ({
        message: 'VPS Bridge request failed'
      }))
      return NextResponse.json(
        { message: errorData.message || 'VPS Bridge request failed' },
        { status: response.status }
      )
    }

    // Safely parse the response body — Zeroclaw can return an empty body on errors
    let result: Record<string, any>
    try {
      const text = await response.text()
      if (!text || text.trim() === '') {
        console.error('[API] VPS Bridge returned empty response body')
        return NextResponse.json(
          { message: 'The diagnostic service returned an empty response. Please try again.' },
          { status: 502 }
        )
      }
      result = JSON.parse(text)
    } catch (parseError) {
      console.error('[API] Failed to parse VPS Bridge response as JSON:', parseError)
      return NextResponse.json(
        { message: 'The diagnostic service returned an invalid response. Please try again.' },
        { status: 502 }
      )
    }

    // Normalize score field: VPS Bridge returns ai_readiness_score
    if (typeof (result as any).ai_readiness_score === 'number' && typeof result.score !== 'number') {
      result.score = result.ai_readiness_score
    }

    // Bug 2 fix: Strip any numeric ROI fields from the LLM/backend response.
    // ROI numbers MUST be computed exclusively by the pure TypeScript calculateROI()
    // function on the client side. If the LLM accidentally returns ROI numbers,
    // they would be non-deterministic and must never reach the UI.
    const ROI_FIELDS_TO_STRIP = [
      'annualLaborSavings', 'annualLaborSavingsIDR', 'annualLaborSavingsLocal',
      'annualProcessSavings', 'annualProcessSavingsIDR', 'annualProcessSavingsLocal',
      'totalAnnualSavings', 'totalAnnualSavingsIDR', 'totalAnnualSavingsLocal', 'totalAnnualSavingsUSD',
      'costOfInaction90Days', 'costOfInaction90DaysIDR', 'costOfInaction90DaysLocal',
      'paybackMonths', 'threeYearROI', 'threeYearROIPercent',
      'hoursReclaimedPerYear', 'roiProjection', 'calculations',
    ]
    for (const field of ROI_FIELDS_TO_STRIP) {
      if (field in result) {
        console.warn(`[API] Stripping LLM-generated ROI field "${field}" from backend response — ROI must be formula-based only`)
        delete result[field]
      }
    }

    return NextResponse.json({
      status: 'success',
      type: 'deep_diagnostic',
      scan_id: result.diagnostic_id,
      data: result,
      timestamp: new Date().toISOString(),
      // Spread top-level for backward compat with service validation
      ...result
    })
  } catch (error) {
    console.error('[API] Deep diagnostic unexpected error:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  } finally {
    clearTimeout(timeoutId)
  }
}
