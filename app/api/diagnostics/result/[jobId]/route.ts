import { NextRequest, NextResponse } from 'next/server'
import { VPS_BRIDGE_CONFIG } from '@/lib/config'

export const maxDuration = 30

// ROI numbers must be computed exclusively by the pure TypeScript calculateROI()
// on the client. Strip any the LLM/backend may have returned.
const ROI_FIELDS_TO_STRIP = [
  'annualLaborSavings', 'annualLaborSavingsIDR', 'annualLaborSavingsLocal',
  'annualProcessSavings', 'annualProcessSavingsIDR', 'annualProcessSavingsLocal',
  'totalAnnualSavings', 'totalAnnualSavingsIDR', 'totalAnnualSavingsLocal', 'totalAnnualSavingsUSD',
  'costOfInaction90Days', 'costOfInaction90DaysIDR', 'costOfInaction90DaysLocal',
  'paybackMonths', 'threeYearROI', 'threeYearROIPercent',
  'hoursReclaimedPerYear', 'roiProjection', 'calculations',
]

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  if (!jobId) {
    return NextResponse.json({ message: 'jobId is required' }, { status: 400 })
  }

  let response: Response
  try {
    response = await fetch(
      `${VPS_BRIDGE_CONFIG.baseUrl}/diagnostics/result/${encodeURIComponent(jobId)}`,
      { method: 'GET' }
    )
  } catch (fetchError: unknown) {
    console.error('[API] VPS Bridge unreachable (result poll):', (fetchError as Error)?.message)
    return NextResponse.json(
      { message: `VPS Bridge is not reachable at ${VPS_BRIDGE_CONFIG.baseUrl}.` },
      { status: 503 }
    )
  }

  if (response.status === 404) {
    return NextResponse.json({ message: 'Diagnostic job not found' }, { status: 404 })
  }

  const payload = await response.json().catch(() => null)
  if (!payload) {
    return NextResponse.json(
      { message: 'The diagnostic service returned an invalid response. Please try again.' },
      { status: 502 }
    )
  }

  // Still running -> tell the client to keep polling.
  if (payload.status && payload.status !== 'completed') {
    if (payload.status === 'failed') {
      return NextResponse.json(
        { message: payload.message || 'Diagnostic failed. Please try again.' },
        { status: 502 }
      )
    }
    return NextResponse.json({ status: payload.status }) // waiting | active | delayed
  }

  // Completed — normalize + strip ROI, then return the same shape the client expects.
  const result: Record<string, any> = payload.result || {}

  if (typeof result.ai_readiness_score === 'number' && typeof result.score !== 'number') {
    result.score = result.ai_readiness_score
  }
  for (const field of ROI_FIELDS_TO_STRIP) {
    if (field in result) {
      console.warn(`[API] Stripping LLM-generated ROI field "${field}" — ROI must be formula-based only`)
      delete result[field]
    }
  }

  return NextResponse.json({
    status: 'success',
    type: 'deep_diagnostic',
    scan_id: result.diagnostic_id,
    data: result,
    timestamp: new Date().toISOString(),
    ...result,
  })
}
