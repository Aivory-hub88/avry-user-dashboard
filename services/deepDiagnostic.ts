import {
  PhaseId,
  PhaseConfig,
  DeepDiagnosticProgress,
  DeepDiagnosticResponse,
  DeepDiagnosticResult
} from '@/types/deepDiagnostic'
import type { BlueprintV1 } from '@/types/blueprint'
import {
  saveDeepDiagnosticResult as _remoteSaveResult,
  loadDeepDiagnosticResult as _remoteLoadResult,
} from '@/lib/reportStorage'
import { getUser } from '@/lib/auth'
import { FX_AS_OF } from '@/lib/currencyConfig'
import { getRate, getFxAsOfLabel, ensureLiveRates } from '@/lib/liveRates'
import { asset } from '@/lib/asset'
import { DEEP_DIAGNOSTIC_PHASES } from '@/constants/deepDiagnosticQuestions'
import { ID_QUESTION_COPY } from '@/constants/deepDiagnosticQuestionsId'

export type Locale = 'en' | 'id'

const QUESTION_OPTIONS_BY_ID: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {}
  for (const phase of DEEP_DIAGNOSTIC_PHASES) {
    for (const q of phase.questions) {
      if (q.options) map[q.id] = q.options
    }
  }
  return map
})()

/**
 * Translates a stored canonical (English) answer string back to its Bahasa
 * Indonesia display label, reusing the exact same dictionary the intake flow
 * uses (constants/deepDiagnosticQuestionsId.ts) so wording stays consistent
 * wherever the same answer is quoted — in the intake review page and here,
 * in the report narrative. Falls back to the raw value when no translation
 * exists (e.g. the question has no options, or the value is free text).
 */
export function humanizeAnswerId(questionId: string, value: string | undefined | null): string {
  if (!value) return ''
  const canonicalOptions = QUESTION_OPTIONS_BY_ID[questionId]
  if (!canonicalOptions) return value
  const idx = canonicalOptions.indexOf(value)
  if (idx < 0) return value
  return ID_QUESTION_COPY[questionId]?.options?.[idx] ?? value
}

// Re-export so callers (summary/final-result pages) can prefetch live FX
// before running the deterministic ROI computation.
export { ensureLiveRates }

// In-memory fallback when localStorage is unavailable
let _memoryProgress: DeepDiagnosticProgress | null = null

export interface BlueprintGenerationProgress {
  elapsedMs: number
  /** 0-100. Estimated — the backend has no real completion fraction to report,
   *  only "still running"/"done" — so this is time-based, not measured. */
  percent: number
}

// Real generation is a single large structured LLM completion (deployment
// plan, workflow modules, risk assessment, ROI narrative) and typically
// finishes in ~60-90s. Used only to drive the progress bar's ease-out curve —
// never to cut generation short (the actual poll loop in generateBlueprint
// runs up to 480s regardless of this estimate).
const EXPECTED_BLUEPRINT_DURATION_MS = 75_000

/**
 * Time-based progress estimate for the Generate Blueprint button. Eases
 * toward 95% and deliberately never reaches 100% on its own — the real
 * completion (or a slower-than-usual run) always supplies the final jump, so
 * the bar never lies about being done before the server confirms it.
 */
export function estimateBlueprintProgress(elapsedMs: number): BlueprintGenerationProgress {
  const percent = Math.round(95 * (1 - Math.exp(-elapsedMs / EXPECTED_BLUEPRINT_DURATION_MS)))
  return { elapsedMs, percent }
}

export class DeepDiagnosticService {
  private static readonly STORAGE_KEY = 'aivory_deep_diagnostic'
  private static readonly RESULT_KEY = 'aivory_deep_result'

  static saveProgress(progress: DeepDiagnosticProgress): void {
    try {
      const data = { ...progress, lastUpdated: new Date().toISOString() }
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('[DeepDiagnostic] Failed to save progress:', error)
      _memoryProgress = { ...progress, lastUpdated: new Date().toISOString() }
    }
  }

  static loadProgress(): DeepDiagnosticProgress | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      if (!stored) return _memoryProgress
      const progress = JSON.parse(stored) as DeepDiagnosticProgress
      if (!progress.phases || !progress.currentPhase) {
        console.warn('[DeepDiagnostic] Invalid stored data, clearing')
        this.clearProgress()
        return null
      }
      return progress
    } catch (error) {
      console.error('[DeepDiagnostic] Failed to load progress:', error)
      return _memoryProgress
    }
  }

  static clearProgress(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY)
    } catch (error) {
      console.error('[DeepDiagnostic] Failed to clear progress:', error)
    }
    _memoryProgress = null
  }

  static async submitDiagnostic(
    organizationId: string,
    phases: Record<PhaseId, Record<string, any>>
  ): Promise<DeepDiagnosticResponse> {
    // 1) Enqueue the deep diagnostic — the bridge returns a job_id immediately.
    let submitRes: Response
    try {
      submitRes = await fetch(asset('/api/diagnostics/run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: organizationId, mode: 'deep', phases }),
      })
    } catch (err: any) {
      throw new Error(err?.message || 'Failed to submit diagnostic')
    }
    if (!submitRes.ok) {
      const error = await submitRes.json().catch(() => ({ message: 'Failed to submit diagnostic' }))
      throw new Error(error.message || 'Failed to submit diagnostic')
    }
    const queued = await submitRes.json().catch(() => ({} as any))
    const jobId = queued?.job_id
    if (!jobId) throw new Error('Invalid response format from server')

    // 2) Poll for the result until complete (avoids the Cloudflare ~100s timeout
    //    that broke the old synchronous request).
    const deadline = Date.now() + 180_000
    const POLL_INTERVAL_MS = 3_000
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
      let pollRes: Response
      try {
        pollRes = await fetch(asset(`/api/diagnostics/result/${jobId}`))
      } catch {
        continue // transient network blip — keep polling
      }
      if (!pollRes.ok) {
        const error = await pollRes.json().catch(() => ({ message: 'Diagnostic failed' }))
        throw new Error(error.message || 'Diagnostic failed')
      }
      const data = await pollRes.json().catch(() => ({} as any))
      if (data?.status && data.status !== 'success') continue // still running

      const result = data as DeepDiagnosticResponse
      if (!result.diagnostic_id) throw new Error('Invalid response format from server')
      if (
        typeof (result as any).ai_readiness_score === 'number' &&
        typeof result.score !== 'number'
      ) {
        (result as any).score = (result as any).ai_readiness_score
      }
      if (typeof result.score !== 'number') throw new Error('Invalid response format from server')
      return result
    }
    throw new Error('Diagnostic timed out. Please try again.')
  }

  /**
   * Saves a diagnostic result.
   * localStorage write-through + per-user server sync (keyed by the signed-in
   * user's JWT inside lib/reportStorage — no org/user id is passed).
   */
  static saveResult(result: DeepDiagnosticResult): void {
    // reportStorage writes localStorage synchronously before the server POST,
    // so synchronous readers see the value immediately.
    _remoteSaveResult(result).catch((err) => {
      // Both stores failed — log but don't crash the caller
      console.error('[DeepDiagnostic] saveResult failed:', err)
    })
  }

  /**
   * Loads a diagnostic result.
   * Returns the localStorage value synchronously (callers depend on the sync
   * shape) and refreshes the cache from the per-user server row in the
   * background for the next load.
   */
  static loadResult(): DeepDiagnosticResult | null {
    if (typeof window === 'undefined') return null

    const localResult = (() => {
      try {
        const stored = localStorage.getItem(this.RESULT_KEY)
        if (!stored) return null
        const result = JSON.parse(stored) as DeepDiagnosticResult
        const hasScore =
          typeof result.score === 'number' ||
          typeof (result as any).ai_readiness_score === 'number'
        if (!result.diagnostic_id || !hasScore) {
          console.warn('[DeepDiagnostic] Invalid result data, clearing')
          this.clearResult()
          return null
        }
        if (typeof result.score !== 'number' && typeof (result as any).ai_readiness_score === 'number') {
          (result as any).score = (result as any).ai_readiness_score
        }
        return result
      } catch (error) {
        console.error('[DeepDiagnostic] Failed to load result:', error)
        return null
      }
    })()

    // Background sync: refresh the localStorage cache from Postgres
    _remoteLoadResult().catch(() => { /* silent — localStorage already returned */ })

    return localResult
  }

  static clearResult(): void {
    try {
      localStorage.removeItem(this.RESULT_KEY)
    } catch (error) {
      console.error('[DeepDiagnostic] Failed to clear result:', error)
    }
  }

  static async generateBlueprint(
    diagnosticId: string,
    organizationId?: string,
    objective: string = 'Operational health improvement',
    diagnosticData?: Record<string, any>,
    locale: 'en' | 'id' = 'en',
    onProgress?: (progress: BlueprintGenerationProgress) => void
  ): Promise<BlueprintV1> {
    // Blueprint runs are attributed to the signed-in user, not a shared demo
    // key or a collision-prone company name.
    const orgId = organizationId?.trim() || getUser()?.user_id || 'current'
    const startedAt = Date.now()
    const reportProgress = () => onProgress?.(estimateBlueprintProgress(Date.now() - startedAt))
    reportProgress()

    // 1) Enqueue — the bridge returns a job_id immediately (2026-08-09: moved
    // off a single held request, which can't survive Cloudflare's ~100-120s
    // edge timeout on the 1-5+ minute real generation time). See
    // app/api/blueprints/generate/route.ts + .../result/[jobId]/route.ts.
    let submitRes: Response
    try {
      // asset() prepends the /dashboard basePath — raw fetch() paths don't
      // get it automatically (same gotcha as the PDF cover assets).
      submitRes = await fetch(asset('/api/blueprints/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diagnostic_id: diagnosticId,
          organization_id: orgId,
          objective,
          locale,
          ...(diagnosticData ? { diagnostic_data: diagnosticData } : {}),
        }),
      })
    } catch (err: any) {
      throw new Error(err?.message || 'Failed to generate blueprint')
    }
    if (!submitRes.ok) {
      const error = await submitRes.json().catch(() => ({ message: 'Failed to generate blueprint' }))
      throw new Error(error.message || 'Failed to generate blueprint')
    }
    const queued = await submitRes.json().catch(() => ({} as any))
    const jobId = queued?.job_id
    if (!jobId) throw new Error('Invalid response format from server')

    // 2) Poll for the result until complete.
    const deadline = Date.now() + 480_000
    const POLL_INTERVAL_MS = 5_000
    let blueprint: BlueprintV1 | null = null
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
      reportProgress()
      let pollRes: Response
      try {
        pollRes = await fetch(asset(`/api/blueprints/result/${jobId}`))
      } catch {
        continue // transient network blip — keep polling
      }
      if (!pollRes.ok) {
        const error = await pollRes.json().catch(() => ({ message: 'Blueprint generation failed' }))
        throw new Error(error.message || 'Blueprint generation failed')
      }
      const data = await pollRes.json().catch(() => ({} as any))
      if (data?.jobStatus && data.jobStatus !== 'completed') continue // still running
      blueprint = data as BlueprintV1
      break
    }
    if (!blueprint) throw new Error('Blueprint generation timed out. Please try again.')
    onProgress?.({ elapsedMs: Date.now() - startedAt, percent: 100 })

    // Dual-write blueprint to Postgres (per signed-in user) + localStorage
    const { saveBlueprint: _remoteSaveBlueprint } = await import('@/lib/reportStorage')
    _remoteSaveBlueprint(blueprint).catch((err) => {
      console.error('[DeepDiagnostic] generateBlueprint server save failed:', err)
    })

    return blueprint
  }

  static validatePhase(
    phase: PhaseConfig,
    responses: Record<string, any>
  ): Record<string, string> {
    const errors: Record<string, string> = {}

    for (const question of phase.questions) {
      if (!question.required) continue
      const value = responses[question.id]

      if (value === undefined || value === null || value === '') {
        errors[question.id] = 'This field is required'
        continue
      }

      if (question.type === 'multiselect' && Array.isArray(value) && value.length === 0) {
        errors[question.id] = 'Please select at least one option'
      }

      if (question.validation) {
        const { minLength, maxLength, min, max, pattern } = question.validation

        if (typeof value === 'string') {
          if (minLength && value.length < minLength)
            errors[question.id] = `Minimum ${minLength} characters required`
          if (maxLength && value.length > maxLength)
            errors[question.id] = `Maximum ${maxLength} characters allowed`
          if (pattern && !new RegExp(pattern).test(value))
            errors[question.id] = 'Invalid format'
        }

        if (typeof value === 'number') {
          if (min !== undefined && value < min) errors[question.id] = `Minimum value is ${min}`
          if (max !== undefined && value > max) errors[question.id] = `Maximum value is ${max}`
        }
      }
    }

    return errors
  }
}

// ============================================================================
// buildDiagnosticContext
// ============================================================================

import type {
  DiagnosticAnswers,
  DiagnosticContext,
  ROIProjection,
  DimensionScores,
  DimensionKey,
  MaturityLevel,
  RankedOpportunity,
  RiskFlag,
  OpportunityQuadrant,
  ImprovementItem,
} from '@/types/diagnostic'
import { parseCurrencyCode, formatCurrency, type CurrencyCode } from '@/lib/resultFormatters'

// ---- String normalization helper ----
// FIX #1: Normalize em-dash / en-dash / non-breaking spaces to regular hyphen+space
// so map lookups work regardless of how the form encodes the string.
function normalizeStr(s: string | undefined): string {
  if (!s) return ''
  return s
    .replace(/[–—]/g, '-')       // em/en dash → hyphen
    .replace(/\u00A0/g, ' ')     // non-breaking space → space
    .trim()
}

// ---- Numeric extraction helpers ----

// FIX #2: parsePct now returns the MIDPOINT for range strings like "10–25%"
// instead of just the first number. First-number-only caused 10% to be used
// everywhere instead of the correct 17.5% midpoint.
function parsePct(val: string | undefined): number | null {
  if (!val) return null
  const norm = normalizeStr(val)
  const rangeMatch = norm.match(/(\d+)\s*-\s*(\d+)/)
  if (rangeMatch) {
    return (parseInt(rangeMatch[1], 10) + parseInt(rangeMatch[2], 10)) / 2
  }
  const single = norm.match(/(\d+)/)
  return single ? parseInt(single[1], 10) : null
}

function parseBudgetMidpointUSD(val: string | undefined): number | null {
  if (!val) return null
  const map: Record<string, number> = {
    'Under $10k': 5_000,
    '$10k - $50k': 30_000,
    '$50k - $100k': 75_000,
    '$100k - $500k': 300_000,
    'Over $500k': 750_000,
  }
  return map[val] ?? null
}

function parseTimelineMonths(val: string | undefined): number | null {
  if (!val) return null
  const m = normalizeStr(val).match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

// FIX #1 applied: normalize before map lookup to handle en-dash variants
function parseManualHoursWeekly(val: string | undefined): number | null {
  if (!val) return null
  const norm = normalizeStr(val)
  const map: Record<string, number> = {
    'Under 10 hours/week': 5,
    '10-25 hours/week': 17,
    '25-50 hours/week': 37,
    '50-100 hours/week': 70,
    'Over 100 hours/week': 100,
  }
  // Try direct lookup first, then normalized key
  return map[val] ?? map[norm] ?? null
}

function parseFteCount(val: string | undefined): number | null {
  if (!val) return null
  const norm = normalizeStr(val)
  const map: Record<string, number> = {
    'Solo / Freelancer (1 person)': 1,
    '1-5 FTEs': 3,
    '6-15 FTEs': 10,
    '16-50 FTEs': 33,
    '51-200 FTEs': 125,
    'Over 200 FTEs': 300,
  }
  return map[val] ?? map[norm] ?? null
}

// ---- Currency ----

// CURRENCY_RATES + FX_AS_OF now sourced from @/lib/currencyConfig

// FIX #3: Industry-aware labor hourly rate (USD).
// Previously hardcoded at $15/hr which is unrealistic for Tech/Software.
const INDUSTRY_HOURLY_RATE_USD: Record<string, number> = {
  'Technology / Software': 65,
  'Finance / Banking': 60,
  'Healthcare': 50,
  'Retail / E-commerce': 30,
  'Manufacturing': 25,
  'Other': 30,
}
const DEFAULT_HOURLY_RATE_USD = 30

function getHourlyRateUSD(industry: string | undefined): number {
  if (!industry) return DEFAULT_HOURLY_RATE_USD
  return INDUSTRY_HOURLY_RATE_USD[industry] ?? DEFAULT_HOURLY_RATE_USD
}

// FIX: IDR reports must not price labour by running a US-centric industry
// rate through the market FX rate — a $65/hr Tech/Software assumption at a
// ~16,600 IDR/USD rate prices Indonesian labour at ~Rp 1,000,000/hour, ~30x
// the real Jakarta wage floor. Anchor the IDR rate to the DKI Jakarta UMP
// (Upah Minimum Provinsi) instead, keeping the same industry-relative
// multipliers so a Tech company still costs proportionally more than
// Manufacturing, just at a realistic absolute magnitude.
//
// UMP DKI Jakarta 2026 = Rp 5,729,876/month (Kepgub DKI Jakarta, +6.17% on
// 2025's Rp 5,396,791, effective 1 Jan 2026). Update this constant when a
// new UMP is announced (usually late November for the following year).
const UMP_JAKARTA_MONTHLY_IDR = 5_729_876
// Statutory monthly working-hour divisor for a 40-hour/5-day week
// (Kepmenaker No. 102/MEN/VI/2004).
const IDR_MONTHLY_WORK_HOURS = 173
const UMR_JAKARTA_HOURLY_IDR = UMP_JAKARTA_MONTHLY_IDR / IDR_MONTHLY_WORK_HOURS // ≈ Rp 33,121/hr

function getHourlyRateIDR(industry: string | undefined): number {
  const usdRate = getHourlyRateUSD(industry)
  const industryMultiplier = usdRate / DEFAULT_HOURLY_RATE_USD // e.g. Tech 65/30 ≈ 2.17x
  return Math.round(UMR_JAKARTA_HOURLY_IDR * industryMultiplier)
}

// ---- ROI calculation ----

export interface ROIProjectionInternal extends ROIProjection {
  // totalAnnualSavingsUSD is already on ROIProjection (Bug 3 fix)
}

export function calculateROI(
  q: DiagnosticContext['quantitative'],
  currencyCode: CurrencyCode = 'USD',
  industry: string | undefined = undefined,
  /**
   * Phase E1.4/E2.4 — optional override for the efficiency factor, used by
   * the ROI sensitivity tornado (E1.4) and the what-if slider (E2.4) to
   * re-evaluate this exact formula at a different assumption WITHOUT
   * touching the real save-time computation. Both real call sites in this
   * file omit this argument, so they keep computing at the standard 0.75
   * exactly as before this change — zero numeric change to stored figures
   * (E-invariant 1/3 in docs/OPS-TRANSFORMATION-NARRATIVE-BRIEF.md §8).
   */
  efficiencyFactorOverride?: number
): ROIProjectionInternal {
  // Live FX when available (2h auto-refresh via /api/exchange-rates),
  // static snapshot otherwise.
  const rate = getRate(currencyCode)
  const missing: string[] = []

  if (q.totalManualHoursWeekly === null) missing.push('manual hours/week')
  if (q.budgetMidpointUSD === null) missing.push('budget')
  if (q.fteCountInScope === null) missing.push('FTE count')

  const hasEnough = missing.length === 0
  const confidence: ROIProjection['confidenceLevel'] =
    missing.length === 0 ? 'high' : missing.length === 1 ? 'medium' : 'low'

  // FIX #3: Use industry-aware hourly rate.
  // Methodology fix: For solo/micro teams (1–5 FTEs), reclaimed hours are
  // opportunity cost rather than direct payroll savings, so we apply a
  // discount FACTOR to the real industry rate — NOT a flat $8/hr that throws
  // away the industry signal. The previous flat $8/hr made a Tech/Software
  // team's reclaimed time worth less than minimum wage, producing absurd
  // payback periods (e.g. 104 months) and negative 3-year ROI.
  //
  // SMALL_TEAM_RATE_FACTOR (0.5) reflects that for small teams the saved time
  // converts to opportunity value (rework, growth, billable work) at roughly
  // half the fully-loaded employment cost. A Tech team at $65/hr → $32.5/hr.
  const SMALL_TEAM_RATE_FACTOR = 0.5
  const smallTeamRateApplied = (q.fteCountInScope ?? 1) <= 5

  // For IDR, apply the small-team factor to the UMP-anchored Rupiah figure
  // (rounds cleanly at Rupiah scale, e.g. 71,763 → 35,882) and only then
  // derive the "USD" rate backwards (localRate / fxRate) so the existing
  // *rate conversion below reproduces that exact Jakarta-realistic figure.
  // Rounding at the pseudo-USD scale instead (≈4.6 → 2) would have thrown
  // away most of the precision. This field stops being a literal USD number
  // for IDR contexts, but it's only ever consumed inside this same
  // currency's calculation, never compared across currencies.
  let baseHourlyRateUSD: number
  let hourlyRateUSD: number
  if (currencyCode === 'IDR') {
    const idrRate = getHourlyRateIDR(industry)
    baseHourlyRateUSD = idrRate / rate
    hourlyRateUSD = (smallTeamRateApplied ? Math.round(idrRate * SMALL_TEAM_RATE_FACTOR) : idrRate) / rate
  } else {
    baseHourlyRateUSD = getHourlyRateUSD(industry)
    hourlyRateUSD = smallTeamRateApplied
      ? Math.round(baseHourlyRateUSD * SMALL_TEAM_RATE_FACTOR)
      : baseHourlyRateUSD
  }

  const weeklyHours = q.totalManualHoursWeekly ?? 0
  const hoursPerYear = weeklyHours * 52
  const targetAutoPct = (q.targetAutomationPct ?? 50) / 100
  const currentAutoPct = (q.currentAutomationPct ?? 20) / 100

  // FIX #4: Cap was 0.5 (50%) — should be 1.0. A user with 10% current
  // automation targeting 90% has a real 80% incremental gap, not 50%.
  const incrementalAutoPct = Math.max(0, Math.min(targetAutoPct - currentAutoPct, 1.0))

  // FIX #5: Document efficiency factor explicitly.
  // Formula: weeklyHours × 52 weeks × automation gap × 0.75 efficiency factor.
  // The 0.75 factor accounts for ramp-up time, partial automation coverage,
  // edge-case handling, and human oversight still required in automated flows.
  const EFFICIENCY_FACTOR = efficiencyFactorOverride ?? 0.75
  const hoursReclaimedPerYear = q.totalManualHoursWeekly
    ? Math.round(hoursPerYear * incrementalAutoPct * EFFICIENCY_FACTOR)
    : null

  const annualLaborSavingsUSD = hoursReclaimedPerYear
    ? hoursReclaimedPerYear * hourlyRateUSD
    : null

  // Process savings = 20% of labor savings (operational overhead reduction)
  const annualProcessSavingsUSD = annualLaborSavingsUSD
    ? annualLaborSavingsUSD * 0.2
    : null

  const totalAnnualSavingsUSD =
    annualLaborSavingsUSD !== null && annualProcessSavingsUSD !== null
      ? annualLaborSavingsUSD + annualProcessSavingsUSD
      : null

  const budgetUSD = q.budgetMidpointUSD
  const paybackMonths =
    totalAnnualSavingsUSD && budgetUSD
      ? (budgetUSD / totalAnnualSavingsUSD) * 12
      : null

  const rawThreeYearROI =
    totalAnnualSavingsUSD && budgetUSD && budgetUSD > 0
      ? ((totalAnnualSavingsUSD * 3 - budgetUSD) / budgetUSD) * 100
      : null
  const threeYearROIPercent =
    rawThreeYearROI !== null ? Math.min(rawThreeYearROI, 999) : null

  const costOfInaction90DaysUSD = totalAnnualSavingsUSD
    ? totalAnnualSavingsUSD * (90 / 365)
    : null

  // ── Ongoing run cost + net economics (enterprise credibility) ───────────
  // Year-1 investment (budget) alone overstates ROI; real programs carry an
  // annual run cost (licenses, maintenance, support, monitoring). Assume it is
  // a fraction of the initial investment per year.
  const ONGOING_COST_RATE = 0.20
  const annualOngoingCostUSD = budgetUSD !== null ? Math.round(budgetUSD * ONGOING_COST_RATE) : null
  const netAnnualSavingsUSD =
    totalAnnualSavingsUSD !== null && annualOngoingCostUSD !== null
      ? totalAnnualSavingsUSD - annualOngoingCostUSD
      : totalAnnualSavingsUSD
  const netPaybackMonths =
    netAnnualSavingsUSD && netAnnualSavingsUSD > 0 && budgetUSD
      ? Math.round((budgetUSD / netAnnualSavingsUSD) * 12 * 10) / 10
      : null
  const netThreeYearROIRaw =
    netAnnualSavingsUSD !== null && budgetUSD && budgetUSD > 0
      ? ((netAnnualSavingsUSD * 3 - budgetUSD) / budgetUSD) * 100
      : null
  const netThreeYearROIPercent =
    netThreeYearROIRaw !== null ? Math.min(Math.round(netThreeYearROIRaw), 999) : null

  // Scenario range: vary the efficiency factor conservative..optimistic.
  const scenarioNetRoi = (eff: number): number | null => {
    if (!q.totalManualHoursWeekly || annualOngoingCostUSD === null || !budgetUSD || budgetUSD <= 0) return null
    const reclaimed = hoursPerYear * incrementalAutoPct * eff
    const labor = reclaimed * hourlyRateUSD
    const total = labor + labor * 0.2
    const net = total - annualOngoingCostUSD
    return Math.min(Math.round(((net * 3 - budgetUSD) / budgetUSD) * 100), 999)
  }
  const scenarioThreeYearROI = {
    low: scenarioNetRoi(0.5),
    base: netThreeYearROIPercent,
    high: scenarioNetRoi(0.9),
  }

  // NPV of 3-year net cash flows (discounted) — enterprise cash-flow view.
  const DISCOUNT_RATE = 0.10
  const npv3YearUSD =
    netAnnualSavingsUSD !== null && budgetUSD !== null
      ? Math.round(
          [1, 2, 3].reduce((acc, t) => acc + (netAnnualSavingsUSD as number) / Math.pow(1 + DISCOUNT_RATE, t), 0) - budgetUSD
        )
      : null

  // Bug 3 — Audit log: always log budgetMidpointUSD alongside the ROI result
  // so the formula is auditable: ((totalAnnualSavingsUSD × 3 − investment) / investment) × 100
  if (process.env.NODE_ENV !== 'test') {
    console.log('[ROI Audit]', {
      industry: industry ?? 'unknown',
      fxAsOf: getFxAsOfLabel(),
      fxRate: rate,
      fxStaticFallback: FX_AS_OF,
      baseHourlyRateUSD,
      hourlyRateUSD,
      smallTeamRateApplied,
      efficiencyFactor: EFFICIENCY_FACTOR,
      hoursReclaimedPerYear,
      budgetMidpointUSD: budgetUSD,
      totalAnnualSavingsUSD,
      paybackMonths: paybackMonths !== null ? Math.round(paybackMonths * 10) / 10 : null,
      rawThreeYearROI: rawThreeYearROI !== null ? Math.round(rawThreeYearROI * 10) / 10 : null,
      threeYearROIPercent,
      capped: rawThreeYearROI !== null && rawThreeYearROI > 999,
    })
  }

  return {
    // Bug 1 fix: currency-neutral field names (*Local instead of *IDR)
    annualLaborSavingsLocal: annualLaborSavingsUSD ? annualLaborSavingsUSD * rate : null,
    annualProcessSavingsLocal: annualProcessSavingsUSD ? annualProcessSavingsUSD * rate : null,
    totalAnnualSavingsLocal: totalAnnualSavingsUSD ? totalAnnualSavingsUSD * rate : null,
    costOfInaction90DaysLocal: costOfInaction90DaysUSD ? costOfInaction90DaysUSD * rate : null,
    // Bug 3 fix: expose raw USD field so formula verification never needs division
    totalAnnualSavingsUSD,
    hoursReclaimedPerYear,
    paybackMonths,
    threeYearROIPercent,
    hasEnoughDataForProjection: hasEnough,
    confidenceLevel: confidence,
    missingInputs: missing,
    // Methodology transparency fields — expose the assumptions behind the numbers
    assumedHourlyRateUSD: hourlyRateUSD,
    assumedHourlyRateLocal: hourlyRateUSD * rate,
    assumedBudgetMidpointUSD: budgetUSD,
    assumedBudgetMidpointLocal: budgetUSD !== null ? budgetUSD * rate : null,
    efficiencyFactor: EFFICIENCY_FACTOR,
    smallTeamRateApplied,
    // FX transparency: the exact rate used for the *Local conversions above
    fxRateUsed: rate,
    fxAsOf: getFxAsOfLabel(),
    fxAsOfId: getFxAsOfLabel('id'),
    // Ongoing cost + net economics + scenario range
    ongoingCostRate: ONGOING_COST_RATE,
    annualOngoingCostUSD,
    annualOngoingCostLocal: annualOngoingCostUSD !== null ? annualOngoingCostUSD * rate : null,
    netAnnualSavingsUSD,
    netAnnualSavingsLocal: netAnnualSavingsUSD !== null ? netAnnualSavingsUSD * rate : null,
    netPaybackMonths,
    netThreeYearROIPercent,
    scenarioThreeYearROI,
    discountRate: DISCOUNT_RATE,
    npv3YearUSD,
    npv3YearLocal: npv3YearUSD !== null ? npv3YearUSD * rate : null,
    // Backward-compat aliases for any stored DiagnosticContext that still uses *IDR names
    annualLaborSavingsIDR: annualLaborSavingsUSD ? annualLaborSavingsUSD * rate : null,
    annualProcessSavingsIDR: annualProcessSavingsUSD ? annualProcessSavingsUSD * rate : null,
    totalAnnualSavingsIDR: totalAnnualSavingsUSD ? totalAnnualSavingsUSD * rate : null,
    costOfInaction90DaysIDR: costOfInaction90DaysUSD ? costOfInaction90DaysUSD * rate : null,
  }
}

// ============================================================================
// D2 — confidence-source signal
// ============================================================================
//
// `calculateROI` derives `confidenceLevel` purely from input COMPLETENESS
// (how many of the three required financial inputs are missing). That says
// nothing about how trustworthy the numbers themselves are: a report where
// every field is filled from gut-feel guesses should not read as 'high'
// confidence. D2 adds the `estimate_basis` intake question and folds its
// answer in here as a CEILING on the completeness-based confidence — it can
// only lower the rating, never raise it.
//
// These option strings are LOAD-BEARING (see the header of
// constants/deepDiagnosticQuestions.ts): they match the literal intake option
// text and are frozen once shipped.
export type EstimateBasis =
  | 'Rough estimate / gut feel'
  | 'Informal tracking (notes, spreadsheets)'
  | 'Formal time-tracking system'

const CONFIDENCE_ORDER: ROIProjection['confidenceLevel'][] = ['low', 'medium', 'high']
const CONFIDENCE_RANK: Record<ROIProjection['confidenceLevel'], number> = { low: 0, medium: 1, high: 2 }

/**
 * D2 blending rule (deterministic): the `estimate_basis` answer acts as a
 * CEILING/damper on `baseConfidence` (the existing inputs-completeness
 * confidence), never an amplifier:
 *   - 'Formal time-tracking system'         → neutral (keep baseConfidence)
 *   - 'Informal tracking (notes, spreadsheets)' → cap at 'medium'
 *   - 'Rough estimate / gut feel'           → cap at 'low'
 *   - absent / unknown / any other value    → neutral (keep baseConfidence)
 *
 * BACK-COMPAT INVARIANT: an absent (undefined/null/'') or unrecognized answer
 * MUST be a pure no-op, returning `baseConfidence` unchanged. Old stored
 * contexts and users who skipped this optional question therefore behave
 * EXACTLY as before D2 — no regression. This changes only the qualitative
 * confidence LABEL; no savings/ROI/payback/hours figure is touched.
 */
export function dampConfidenceByEstimateBasis(
  baseConfidence: ROIProjection['confidenceLevel'],
  estimateBasis: string | null | undefined,
): ROIProjection['confidenceLevel'] {
  const norm = normalizeStr(estimateBasis ?? undefined)
  let ceilingRank = CONFIDENCE_RANK[baseConfidence] // neutral default: no cap
  if (norm === 'Rough estimate / gut feel') ceilingRank = CONFIDENCE_RANK.low
  else if (norm === 'Informal tracking (notes, spreadsheets)') ceilingRank = CONFIDENCE_RANK.medium
  // 'Formal time-tracking system' and every unrecognized/absent value fall
  // through to the neutral default above.
  return CONFIDENCE_ORDER[Math.min(CONFIDENCE_RANK[baseConfidence], ceilingRank)]
}

// ============================================================================
// Phase E1.4/E2.4 — ROI sensitivity surface + what-if efficiency slider
// ============================================================================
//
// Both features need to re-run the EXACT `calculateROI` formula at a
// different efficiency assumption without ever mutating a stored
// `DiagnosticContext.calculations`. Rather than duplicating the math (the
// approach used for E1.2's `computeScoreDrivers`, which is a read-only
// derived pass that never touches the scorer), this slice refactors
// `calculateROI` itself to accept an optional efficiency override (see
// above) — the formula is a single pure function with no side effects
// beyond a dev-only audit `console.log`, so it was cleanly separable and
// refactoring is safer than a parallel copy (a past copy-paste split of
// shared math produced three different numbers for the same figure — see
// docs/OPS-TRANSFORMATION-NARRATIVE-BRIEF.md §2). Both real call sites
// (buildDiagnosticContext, upgradeDiagnosticContext) omit the new
// parameter, so stored figures are byte-for-byte unchanged.
//
// The two thin wrappers below are the only client-facing surface: they
// take a full DiagnosticContext (what the browser already has in memory)
// and hand back a freshly-computed ROIProjection — a NEW object, never
// written back onto `context.calculations`.

/** The only efficiency-factor bounds the product has actually defined for
 *  this formula (see `scenarioNetRoi`/`scenarioThreeYearROI` above, which
 *  already ship the 3-Year ROI scenario range at these same bounds). */
export const EFFICIENCY_SCENARIO_BOUNDS = { low: 0.5, high: 0.9 } as const

/**
 * Re-run `calculateROI` for a given DiagnosticContext at an arbitrary
 * efficiency factor. Pure/display-only: returns a brand-new ROIProjection
 * object and never mutates `context` or `context.calculations`. Used by:
 *  - the E2.4 what-if slider (client-side, per-keystroke re-render)
 *  - the E1.4 tornado chart (called at the low/high bounds)
 *  - the PDF's static sensitivity summary (lib/pdfExport.ts, server-safe
 *    since this function has no server-only dependencies)
 */
export function recomputeROIAtEfficiency(
  context: Pick<DiagnosticContext, 'quantitative' | 'currency' | 'qualitative'>,
  efficiencyFactor: number
): ROIProjectionInternal | null {
  // Defensive guard matching `upgradeDiagnosticContext`'s own
  // `!!context.quantitative` checks above: very old stored contexts can
  // predate the `quantitative` field entirely. calculateROI's inputs are
  // all `q.xxx === null` checks, which would throw on `q` itself being
  // undefined — never call it without quantitative present.
  if (!context.quantitative) return null
  const currencyCode = parseCurrencyCode(context.currency)
  const industry = context.qualitative?.industry
  return calculateROI(context.quantitative, currencyCode, industry, efficiencyFactor)
}

export interface ROISensitivityLever {
  key: 'efficiencyFactor'
  label: string
  /** Business Value Created (local currency) at the lever's low bound. */
  lowValueLocal: number | null
  /** Business Value Created (local currency) at the lever's high bound. */
  highValueLocal: number | null
  /** |high − low|, used to rank/size tornado bars. */
  swingLocal: number
  lowBoundLabel: string
  highBoundLabel: string
}

/**
 * Phase E1.4 — tornado-chart data: for each lever that is ACTUALLY a
 * configurable range inside `calculateROI` (checked against the formula
 * above), compute Business Value Created at the low and high bound and
 * report the swing.
 *
 * Judgement call: `calculateROI` only defines a real low/high range for the
 * efficiency factor (0.5–0.9, the same bounds already used by
 * `scenarioThreeYearROI`). The hourly rate (`getHourlyRateUSD` — a fixed
 * per-industry lookup, only varied by the binary small-team-factor branch,
 * not a range) and the automation gap (`incrementalAutoPct` — a point value
 * derived once from the user's current/target automation answers, no
 * alternate bound defined anywhere) are NOT configurable ranges in this
 * formula today. Per the brief's explicit instruction not to invent
 * sensitivity on a dimension that is actually a fixed constant, this
 * function returns a single, honestly-grounded lever rather than fabricated
 * multi-bar comparisons. The return type is an array so a future change
 * that genuinely parameterizes hourly rate or automation gap can add a
 * lever here without changing callers.
 */
export function getROISensitivity(
  context: Pick<DiagnosticContext, 'quantitative' | 'currency' | 'qualitative'>,
  locale: Locale = 'en'
): ROISensitivityLever[] {
  // Contexts missing `quantitative` (very old stored reports, or contexts
  // that predate this field) have nothing to sweep — render nothing rather
  // than crash. Same rule `upgradeDiagnosticContext` already applies before
  // calling calculateROI.
  if (!context.quantitative) return []
  const low = recomputeROIAtEfficiency(context, EFFICIENCY_SCENARIO_BOUNDS.low)
  const high = recomputeROIAtEfficiency(context, EFFICIENCY_SCENARIO_BOUNDS.high)
  if (!low || !high) return []
  const lowValueLocal = low.totalAnnualSavingsLocal
  const highValueLocal = high.totalAnnualSavingsLocal
  const swingLocal =
    lowValueLocal !== null && highValueLocal !== null
      ? Math.abs(highValueLocal - lowValueLocal)
      : 0

  return [
    {
      key: 'efficiencyFactor',
      label: locale === 'id' ? 'Faktor efisiensi otomasi' : 'Automation efficiency factor',
      lowValueLocal,
      highValueLocal,
      swingLocal,
      lowBoundLabel: `${Math.round(EFFICIENCY_SCENARIO_BOUNDS.low * 100)}%`,
      highBoundLabel: `${Math.round(EFFICIENCY_SCENARIO_BOUNDS.high * 100)}%`,
    },
  ]
}

// ---- Dimension scoring ----

function scoreStrategy(a: DiagnosticAnswers): number {
  let s = 50
  if (a.quantified_goal?.includes('specific metrics')) s += 20
  else if (a.quantified_goal?.includes('not quantified')) s += 5
  if (a.kpi_tracking === 'Automated dashboards') s += 15
  else if (a.kpi_tracking === 'Manual reports') s += 5
  if (a.success_timeline === '1-3 months' || a.success_timeline === '3-6 months') s += 10
  return Math.min(100, s)
}

function scoreData(a: DiagnosticAnswers): number {
  let s = 30
  if (a.data_centralization?.includes('Fully centralized')) s += 30
  else if (a.data_centralization?.includes('Partially')) s += 15
  if (a.data_quality?.includes('High quality')) s += 25
  else if (a.data_quality?.includes('Good quality')) s += 15
  else if (a.data_quality?.includes('Moderate')) s += 5
  if (a.system_integration?.includes('Fully integrated')) s += 15
  else if (a.system_integration?.includes('Some integration')) s += 7
  if (a.data_infrastructure?.includes('Modern data platform')) s += 15
  else if (a.data_infrastructure?.includes('warehouse') || a.data_infrastructure?.includes('lake')) s += 10
  else if (a.data_infrastructure?.includes('Databases')) s += 5
  return Math.min(100, s)
}

function scoreProcess(a: DiagnosticAnswers): number {
  let s = 30
  if (a.process_documentation === '75-100%') s += 25
  else if (a.process_documentation === '50-75%') s += 15
  else if (a.process_documentation === '25-50%') s += 7
  if (a.workflow_standardization?.includes('Fully standardized')) s += 25
  else if (a.workflow_standardization?.includes('Mostly standardized')) s += 15
  const autoPct = parsePct(a.automation_current)
  if (autoPct !== null) s += Math.round(autoPct * 0.2)
  return Math.min(100, s)
}

function scorePeople(a: DiagnosticAnswers): number {
  let s = 30
  if (a.internal_capability?.includes('Strong AI team')) s += 35
  else if (a.internal_capability?.includes('Some AI knowledge')) s += 20
  else if (a.internal_capability?.includes('Limited')) s += 8
  if (a.change_readiness?.includes('Embracing')) s += 20
  else if (a.change_readiness?.includes('Open')) s += 12
  else if (a.change_readiness?.includes('Cautious')) s += 5
  if (a.decision_speed?.includes('Hours to days')) s += 15
  else if (a.decision_speed?.includes('Days to weeks')) s += 8
  return Math.min(100, s)
}

function scoreGovernance(a: DiagnosticAnswers): number {
  let s = 40
  if (a.leadership_alignment?.includes('Fully aligned')) s += 30
  else if (a.leadership_alignment?.includes('Supportive')) s += 18
  else if (a.leadership_alignment?.includes('Some interest')) s += 8
  if (a.risk_tolerance?.includes('High')) s += 15
  else if (a.risk_tolerance?.includes('Moderate')) s += 10
  else if (a.risk_tolerance?.includes('Low')) s += 5
  if (a.budget_allocated?.includes('specific allocation')) s += 15
  else if (a.budget_allocated?.includes('flexible')) s += 8
  return Math.min(100, s)
}

function scoreSecurity(a: DiagnosticAnswers): number {
  // Dedicated Security & Governance dimension (enterprise gate).
  let s = 30
  if (a.ai_governance?.includes('Formal AI governance')) s += 22
  else if (a.ai_governance?.includes('Informal')) s += 11
  if (a.ai_data_privacy?.includes('Formal privacy')) s += 22
  else if (a.ai_data_privacy?.includes('Basic')) s += 11
  if (Array.isArray(a.compliance_requirements) &&
      a.compliance_requirements.length > 0 &&
      !a.compliance_requirements.includes('None')) s += 10
  if (a.data_residency && !a.data_residency.includes('Not sure')) s += 6
  return Math.min(100, s)
}

export function maturityFromScore(composite: number): MaturityLevel {
  if (composite >= 80) return 'Optimising'
  if (composite >= 65) return 'Defined'
  if (composite >= 50) return 'Developing'
  if (composite >= 35) return 'Initiating'
  return 'Nascent'
}

/**
 * Single source of truth for rendering automation-gap percentages. Keeps a
 * fractional gap like 32.5% exact instead of letting each caller round it
 * differently (the report previously showed 32.5%, 33% and 38% for the same
 * underlying numbers depending on the section).
 */
export function formatGapPct(value: number, locale: 'en' | 'id' = 'en'): string {
  if (Number.isInteger(value)) return `${value}%`
  return locale === 'id' ? `${value.toFixed(1).replace('.', ',')}%` : `${value.toFixed(1)}%`
}

function calculateDimensionScores(a: DiagnosticAnswers): DimensionScores {
  const strategy = scoreStrategy(a)
  const data = scoreData(a)
  const process = scoreProcess(a)
  const people = scorePeople(a)
  const governance = scoreGovernance(a)
  // security computed below

  const security = scoreSecurity(a)

  const composite = Math.round(
    strategy * 0.2 + data * 0.2 + process * 0.15 + people * 0.15 + governance * 0.15 + security * 0.15
  )

  const dims: Record<DimensionKey, number> = { strategy, data, process, people, governance, security }
  const entries = Object.entries(dims) as [DimensionKey, number][]
  const strongest = entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
  const weakest = entries.reduce((a, b) => (b[1] < a[1] ? b : a))[0]

  return {
    strategy, data, process, people, governance, security,
    composite,
    maturityLevel: maturityFromScore(composite),
    strongestDimension: strongest,
    weakestDimension: weakest,
  }
}

// ---- Score drivers (Phase E1.2 — traceability) ----
//
// Read-only, derived view: mirrors the branch conditions in scoreStrategy/
// scoreData/scoreProcess/scorePeople/scoreGovernance/scoreSecurity above so
// the reported points-per-answer are faithful to what those functions
// actually compute, WITHOUT calling into or altering them in any way. This
// is a deliberate duplication of the branch conditions (not a refactor of
// the scorers) so there is zero risk of this feature changing a score —
// see brief §8 E-invariant 1. If the scorer branches above ever change,
// this table must be updated in lockstep (values only, not logic style).
import type { ScoreDriverItem, ScoreDrivers } from '@/types/diagnostic'

interface DriverFactor {
  answerKey: string
  maxPoints: number
  /** Returns the points this answer actually earned + a human label, given the raw answer. */
  evaluate: (a: DiagnosticAnswers, locale: Locale) => { points: number; label: string }
}

function driverItem(f: DriverFactor, a: DiagnosticAnswers, locale: Locale): ScoreDriverItem {
  const { points, label } = f.evaluate(a, locale)
  const direction: ScoreDriverItem['direction'] = points >= f.maxPoints / 2 ? 'raised' : 'lowered'
  return { answerKey: f.answerKey, label, direction, points, maxPoints: f.maxPoints }
}

/** Picks the top N items by how far their contribution is from the factor's midpoint (most decisive first). */
function topDrivers(items: ScoreDriverItem[], n = 3): ScoreDriverItem[] {
  return [...items]
    .sort((x, y) => Math.abs(y.points - y.maxPoints / 2) - Math.abs(x.points - x.maxPoints / 2))
    .slice(0, n)
}

const STRATEGY_FACTORS: DriverFactor[] = [
  {
    answerKey: 'quantified_goal', maxPoints: 20,
    evaluate: (a, locale) => a.quantified_goal?.includes('specific metrics')
      ? { points: 20, label: locale === 'id' ? 'Tujuan terkait dengan metrik spesifik yang terlacak' : 'Objectives are tied to specific, tracked metrics' }
      : a.quantified_goal?.includes('not quantified')
        ? { points: 5, label: locale === 'id' ? 'Tujuan telah ditetapkan namun belum terukur' : 'Objectives are set but not quantified' }
        : { points: 0, label: locale === 'id' ? 'Belum ada tujuan terukur yang ditetapkan' : 'No quantified objective defined yet' },
  },
  {
    answerKey: 'kpi_tracking', maxPoints: 15,
    evaluate: (a, locale) => a.kpi_tracking === 'Automated dashboards'
      ? { points: 15, label: locale === 'id' ? 'KPI dilacak melalui dasbor otomatis' : 'KPIs are tracked via automated dashboards' }
      : a.kpi_tracking === 'Manual reports'
        ? { points: 5, label: locale === 'id' ? 'KPI dilacak melalui laporan manual' : 'KPIs are tracked via manual reports' }
        : { points: 0, label: locale === 'id' ? 'KPI tidak dilacak secara sistematis' : 'KPIs are not tracked systematically' },
  },
  {
    answerKey: 'success_timeline', maxPoints: 10,
    evaluate: (a, locale) => (a.success_timeline === '1-3 months' || a.success_timeline === '3-6 months')
      ? { points: 10, label: locale === 'id' ? 'Jangka waktu keberhasilan yang realistis (1–6 bulan) telah ditetapkan' : 'A realistic 1–6 month success timeline is set' }
      : { points: 0, label: locale === 'id' ? 'Jangka waktu keberhasilan panjang atau tidak ditentukan' : 'Success timeline is long or open-ended' },
  },
]

const DATA_FACTORS: DriverFactor[] = [
  {
    answerKey: 'data_centralization', maxPoints: 30,
    evaluate: (a, locale) => a.data_centralization?.includes('Fully centralized')
      ? { points: 30, label: locale === 'id' ? 'Data sepenuhnya terpusat dalam warehouse/lake' : 'Data is fully centralised in a warehouse/lake' }
      : a.data_centralization?.includes('Partially')
        ? { points: 15, label: locale === 'id' ? 'Data hanya sebagian terpusat' : 'Data is only partially centralised' }
        : { points: 0, label: locale === 'id' ? 'Data tersebar (silo) atau tidak terpusat' : 'Data is siloed or not centralised' },
  },
  {
    answerKey: 'data_quality', maxPoints: 25,
    evaluate: (a, locale) => a.data_quality?.includes('High quality')
      ? { points: 25, label: locale === 'id' ? 'Kualitas data tinggi, bersih, dan konsisten' : 'Data quality is high, clean, and consistent' }
      : a.data_quality?.includes('Good quality')
        ? { points: 15, label: locale === 'id' ? 'Kualitas data baik dengan sedikit masalah' : 'Data quality is good with minor issues' }
        : a.data_quality?.includes('Moderate')
          ? { points: 5, label: locale === 'id' ? 'Kualitas data sedang dan perlu dibersihkan' : 'Data quality is moderate and needs cleanup' }
          : { points: 0, label: locale === 'id' ? 'Kualitas data memiliki masalah signifikan' : 'Data quality has significant issues' },
  },
  {
    answerKey: 'system_integration', maxPoints: 15,
    evaluate: (a, locale) => a.system_integration?.includes('Fully integrated')
      ? { points: 15, label: locale === 'id' ? 'Sistem terintegrasi penuh dengan API dan otomasi' : 'Systems are fully integrated with APIs and automation' }
      : a.system_integration?.includes('Some integration')
        ? { points: 7, label: locale === 'id' ? 'Ada sebagian integrasi antar sistem utama' : 'Some integration exists between key systems' }
        : { points: 0, label: locale === 'id' ? 'Sistem terputus atau tidak terintegrasi' : 'Systems are disconnected or not integrated' },
  },
  {
    answerKey: 'data_infrastructure', maxPoints: 15,
    evaluate: (a, locale) => a.data_infrastructure?.includes('Modern data platform')
      ? { points: 15, label: locale === 'id' ? 'Platform data modern (streaming, katalog, tata kelola) telah tersedia' : 'A modern data platform (streaming, catalog, governance) is in place' }
      : (a.data_infrastructure?.includes('warehouse') || a.data_infrastructure?.includes('lake'))
        ? { points: 10, label: locale === 'id' ? 'Data warehouse atau data lake telah tersedia' : 'A data warehouse or data lake is in place' }
        : a.data_infrastructure?.includes('Databases')
          ? { points: 5, label: locale === 'id' ? 'Data berada dalam basis data tanpa warehouse/lake' : 'Data lives in databases without a warehouse/lake' }
          : { points: 0, label: locale === 'id' ? 'Infrastruktur data berupa spreadsheet/berkas manual' : 'Data infrastructure is spreadsheets/manual files' },
  },
]

const PROCESS_FACTORS: DriverFactor[] = [
  {
    answerKey: 'process_documentation', maxPoints: 25,
    evaluate: (a, locale) => a.process_documentation === '75-100%'
      ? { points: 25, label: locale === 'id' ? '75–100% proses utama telah terdokumentasi' : '75–100% of key processes are documented' }
      : a.process_documentation === '50-75%'
        ? { points: 15, label: locale === 'id' ? '50–75% proses utama telah terdokumentasi' : '50–75% of key processes are documented' }
        : a.process_documentation === '25-50%'
          ? { points: 7, label: locale === 'id' ? '25–50% proses utama telah terdokumentasi' : '25–50% of key processes are documented' }
          : { points: 0, label: locale === 'id' ? 'Di bawah 25% proses utama yang terdokumentasi' : 'Under 25% of key processes are documented' },
  },
  {
    answerKey: 'workflow_standardization', maxPoints: 25,
    evaluate: (a, locale) => a.workflow_standardization?.includes('Fully standardized')
      ? { points: 25, label: locale === 'id' ? 'Alur kerja sepenuhnya terstandardisasi dengan prosedur yang jelas' : 'Workflows are fully standardised with clear procedures' }
      : a.workflow_standardization?.includes('Mostly standardized')
        ? { points: 15, label: locale === 'id' ? 'Alur kerja sebagian besar terstandardisasi dengan sedikit variasi' : 'Workflows are mostly standardised with some variation' }
        : { points: 0, label: locale === 'id' ? 'Alur kerja sebagian besar bersifat ad-hoc' : 'Workflows are largely ad-hoc' },
  },
  {
    answerKey: 'automation_current', maxPoints: 20,
    evaluate: (a, locale) => {
      const pct = parsePct(a.automation_current)
      const points = pct !== null ? Math.round(pct * 0.2) : 0
      return {
        points,
        label: pct !== null
          ? (locale === 'id' ? `Otomasi saat ini mencakup ${formatGapPct(pct, locale)} dari proses` : `Automation currently covers ${formatGapPct(pct, locale)} of processes`)
          : (locale === 'id' ? 'Cakupan otomasi saat ini tidak dilaporkan' : 'Current automation coverage was not reported'),
      }
    },
  },
]

const PEOPLE_FACTORS: DriverFactor[] = [
  {
    answerKey: 'internal_capability', maxPoints: 35,
    evaluate: (a, locale) => a.internal_capability?.includes('Strong AI team')
      ? { points: 35, label: locale === 'id' ? 'Tim AI yang kuat dan berpengalaman telah tersedia' : 'A strong, experienced AI team is in place' }
      : a.internal_capability?.includes('Some AI knowledge')
        ? { points: 20, label: locale === 'id' ? 'Ada sedikit pengetahuan AI namun masih perlu bimbingan' : 'Some AI knowledge exists but needs guidance' }
        : a.internal_capability?.includes('Limited')
          ? { points: 8, label: locale === 'id' ? 'Kemampuan teknis untuk AI masih terbatas' : 'Technical skills for AI are limited' }
          : { points: 0, label: locale === 'id' ? 'Tidak ada tim teknis internal' : 'There is no internal technical team' },
  },
  {
    answerKey: 'change_readiness', maxPoints: 20,
    evaluate: (a, locale) => a.change_readiness?.includes('Embracing')
      ? { points: 20, label: locale === 'id' ? 'Organisasi secara aktif menyambut perubahan' : 'The organisation is actively embracing change' }
      : a.change_readiness?.includes('Open')
        ? { points: 12, label: locale === 'id' ? 'Organisasi terbuka terhadap perubahan dengan perencanaan yang tepat' : 'The organisation is open to change with proper planning' }
        : a.change_readiness?.includes('Cautious')
          ? { points: 5, label: locale === 'id' ? 'Organisasi berhati-hati terhadap perubahan' : 'The organisation is cautious about change' }
          : { points: 0, label: locale === 'id' ? 'Organisasi menolak perubahan' : 'The organisation is resistant to change' },
  },
  {
    answerKey: 'decision_speed', maxPoints: 15,
    evaluate: (a, locale) => a.decision_speed?.includes('Hours to days')
      ? { points: 15, label: locale === 'id' ? 'Keputusan atas inisiatif baru diambil dalam hitungan jam hingga hari' : 'Decisions on new initiatives happen in hours to days' }
      : a.decision_speed?.includes('Days to weeks')
        ? { points: 8, label: locale === 'id' ? 'Keputusan atas inisiatif baru membutuhkan waktu hari hingga minggu' : 'Decisions on new initiatives take days to weeks' }
        : { points: 0, label: locale === 'id' ? 'Keputusan atas inisiatif baru membutuhkan waktu minggu atau lebih lama' : 'Decisions on new initiatives take weeks or longer' },
  },
]

const GOVERNANCE_FACTORS: DriverFactor[] = [
  {
    answerKey: 'leadership_alignment', maxPoints: 30,
    evaluate: (a, locale) => a.leadership_alignment?.includes('Fully aligned')
      ? { points: 30, label: locale === 'id' ? 'Kepemimpinan sepenuhnya selaras dan menjadi penggerak utama' : 'Leadership is fully aligned and championing this' }
      : a.leadership_alignment?.includes('Supportive')
        ? { points: 18, label: locale === 'id' ? 'Kepemimpinan mendukung namun tetap berhati-hati' : 'Leadership is supportive but cautious' }
        : a.leadership_alignment?.includes('Some interest')
          ? { points: 8, label: locale === 'id' ? 'Kepemimpinan memiliki sedikit ketertarikan namun masih perlu diyakinkan' : 'Leadership has some interest but needs convincing' }
          : { points: 0, label: locale === 'id' ? 'Kepemimpinan tidak menunjukkan keselarasan atau ketertarikan' : 'Leadership shows no alignment or interest' },
  },
  {
    answerKey: 'risk_tolerance', maxPoints: 15,
    evaluate: (a, locale) => a.risk_tolerance?.includes('High')
      ? { points: 15, label: locale === 'id' ? 'Organisasi memiliki toleransi risiko tinggi untuk proyek AI' : 'The organisation has high risk tolerance for AI projects' }
      : a.risk_tolerance?.includes('Moderate')
        ? { points: 10, label: locale === 'id' ? 'Organisasi memiliki toleransi risiko sedang dan seimbang' : 'The organisation has a moderate, balanced risk tolerance' }
        : a.risk_tolerance?.includes('Low') && !a.risk_tolerance?.includes('Very low')
          ? { points: 5, label: locale === 'id' ? 'Organisasi lebih memilih solusi berisiko rendah yang telah terbukti' : 'The organisation prefers proven, low-risk solutions' }
          : { points: 0, label: locale === 'id' ? 'Organisasi sangat menghindari risiko' : 'The organisation is extremely risk-averse' },
  },
  {
    answerKey: 'budget_allocated', maxPoints: 15,
    evaluate: (a, locale) => a.budget_allocated?.includes('specific allocation')
      ? { points: 15, label: locale === 'id' ? 'Anggaran khusus dengan alokasi spesifik telah tersedia' : 'A dedicated budget with specific allocation exists' }
      : a.budget_allocated?.includes('flexible')
        ? { points: 8, label: locale === 'id' ? 'Anggaran yang fleksibel/eksploratif telah tersedia' : 'A flexible/exploratory budget exists' }
        : { points: 0, label: locale === 'id' ? 'Belum ada anggaran khusus yang dialokasikan' : 'No dedicated budget has been allocated' },
  },
]

const SECURITY_FACTORS: DriverFactor[] = [
  {
    answerKey: 'ai_governance', maxPoints: 22,
    evaluate: (a, locale) => a.ai_governance?.includes('Formal AI governance')
      ? { points: 22, label: locale === 'id' ? 'Tata kelola dan pengawasan AI formal telah tersedia' : 'Formal AI governance and oversight is in place' }
      : a.ai_governance?.includes('Informal')
        ? { points: 11, label: locale === 'id' ? 'Pengawasan AI ada namun bersifat informal/ad-hoc' : 'AI oversight exists but is informal/ad-hoc' }
        : { points: 0, label: locale === 'id' ? 'Belum ada proses tata kelola AI' : 'No AI governance process exists' },
  },
  {
    answerKey: 'ai_data_privacy', maxPoints: 22,
    evaluate: (a, locale) => a.ai_data_privacy?.includes('Formal privacy')
      ? { points: 22, label: locale === 'id' ? 'Kebijakan privasi data AI formal dengan kontrol telah tersedia' : 'A formal AI data privacy policy with controls is in place' }
      : a.ai_data_privacy?.includes('Basic')
        ? { points: 11, label: locale === 'id' ? 'Kebijakan privasi data AI dasar telah tersedia' : 'A basic AI data privacy policy exists' }
        : { points: 0, label: locale === 'id' ? 'Belum ada kebijakan privasi data AI formal' : 'No formal AI data privacy policy exists' },
  },
  {
    answerKey: 'compliance_requirements', maxPoints: 10,
    evaluate: (a, locale) => Array.isArray(a.compliance_requirements) &&
      a.compliance_requirements.length > 0 &&
      !a.compliance_requirements.includes('None')
      ? { points: 10, label: locale === 'id' ? `Persyaratan kepatuhan dilacak (${a.compliance_requirements.join(', ')})` : `Compliance requirements are tracked (${a.compliance_requirements.join(', ')})` }
      : { points: 0, label: locale === 'id' ? 'Tidak ada persyaratan kepatuhan yang tercatat' : 'No compliance requirements were captured' },
  },
  {
    answerKey: 'data_residency', maxPoints: 6,
    evaluate: (a, locale) => a.data_residency && !a.data_residency.includes('Not sure')
      ? { points: 6, label: locale === 'id' ? 'Persyaratan residensi data telah ditentukan' : 'Data residency requirements are defined' }
      : { points: 0, label: locale === 'id' ? 'Persyaratan residensi data belum ditentukan' : 'Data residency requirements are undefined' },
  },
]

const DIMENSION_DRIVER_FACTORS: Record<DimensionKey, DriverFactor[]> = {
  strategy: STRATEGY_FACTORS,
  data: DATA_FACTORS,
  process: PROCESS_FACTORS,
  people: PEOPLE_FACTORS,
  governance: GOVERNANCE_FACTORS,
  security: SECURITY_FACTORS,
}

/**
 * Computes the 2–3 answers that most raised/lowered each dimension. Pure,
 * read-only derived pass over the same raw answers the scorer functions
 * consume above — never calls scoreStrategy/scoreData/etc. and never
 * touches `scores`, weights, or thresholds. Safe to call from
 * buildDiagnosticContext as an additive field only (E-invariant 1/4).
 */
export function computeScoreDrivers(a: DiagnosticAnswers, locale: Locale = 'en'): ScoreDrivers {
  const result = {} as ScoreDrivers
  for (const [dim, factors] of Object.entries(DIMENSION_DRIVER_FACTORS) as [DimensionKey, DriverFactor[]][]) {
    const items = factors.map((f) => driverItem(f, a, locale))
    result[dim] = topDrivers(items, 3)
  }
  return result
}

// ---- Opportunity ranking ----

function classifyQuadrant(impact: number, effort: number): OpportunityQuadrant {
  const highImpact = impact >= 5.5
  const lowEffort = effort < 5.5
  if (highImpact && lowEffort) return 'quick_win'
  if (highImpact && !lowEffort) return 'major_project'
  if (!highImpact && lowEffort) return 'fill_in'
  return 'thankless_task'
}

interface OppCandidate {
  id: string
  title: string   // FIX #6: was `name` — renamed to match RankedOpportunity.title
  titleId: string
  impact: number
  effort: number
  timeToValueWeeks: number
  prerequisites: string[]
  prerequisitesId: string[]
  trigger: (a: DiagnosticAnswers) => boolean
  dataScoreKey: 'data' | 'process'
}

// FIX #7: Normalize priority_areas comparison to handle '&' vs 'and' variants
// and case differences so trigger matching is robust across form value formats.
function hasPriorityArea(a: DiagnosticAnswers, keyword: string): boolean {
  if (!Array.isArray(a.priority_areas)) return false
  const kw = keyword.toLowerCase().replace(/&/g, 'and')
  return a.priority_areas.some(
    (area: string) => area.toLowerCase().replace(/&/g, 'and').includes(kw)
  )
}

const OPP_CANDIDATES: OppCandidate[] = [
  {
    id: 'opp-cs-automation',
    title: 'CS Ticket Automation',  // FIX #6
    titleId: 'Otomasi Tiket Layanan Pelanggan',
    impact: 9, effort: 5, timeToValueWeeks: 8,
    prerequisites: [],
    prerequisitesId: [],
    dataScoreKey: 'data',
    trigger: (a) =>
      hasPriorityArea(a, 'customer service') ||
      !!a.pain_points?.toLowerCase().includes('ticket') ||
      !!a.pain_points?.toLowerCase().includes('support'),
  },
  {
    id: 'opp-process-automation',
    title: 'Process Automation',   // FIX #6
    titleId: 'Otomasi Proses',
    impact: 8, effort: 5, timeToValueWeeks: 8,
    prerequisites: [],
    prerequisitesId: [],
    dataScoreKey: 'process',
    trigger: (a) =>
      hasPriorityArea(a, 'operations') ||
      !!a.manual_processes?.toLowerCase().includes('process'),
  },
  {
    id: 'opp-reporting',
    title: 'Automated Reporting',  // FIX #6
    titleId: 'Pelaporan Otomatis',
    impact: 7, effort: 4, timeToValueWeeks: 5,
    prerequisites: [],
    prerequisitesId: [],
    dataScoreKey: 'data',
    trigger: (a) =>
      hasPriorityArea(a, 'data analysis') ||
      hasPriorityArea(a, 'reporting') ||
      !!a.manual_processes?.toLowerCase().includes('report'),
  },
  {
    id: 'opp-sales-intelligence',
    title: 'Sales Intelligence',   // FIX #6
    titleId: 'Intelijen Penjualan',
    impact: 7, effort: 6, timeToValueWeeks: 10,
    prerequisites: ['CRM integration'],
    prerequisitesId: ['Integrasi CRM'],
    dataScoreKey: 'data',
    trigger: (a) => hasPriorityArea(a, 'sales'),
  },
  {
    id: 'opp-cross-reporting',
    title: 'Cross-system Reporting',  // FIX #6
    titleId: 'Pelaporan Lintas Sistem',
    impact: 6, effort: 5, timeToValueWeeks: 5,
    prerequisites: [],
    prerequisitesId: [],
    dataScoreKey: 'data',
    trigger: () => true,
  },
]

function rankOpportunities(
  a: DiagnosticAnswers,
  scores: DimensionScores,
  currencyCode: CurrencyCode = 'USD',
  totalAnnualSavingsUSD: number | null = null,
  locale: Locale = 'en',
): RankedOpportunity[] {
  const dataReadiness = (score: number): RankedOpportunity['dataReadiness'] =>
    score >= 70 ? 'ready' : score >= 45 ? 'needs_prep' : 'not_ready'

  const complexity = (effort: number): RankedOpportunity['complexity'] =>
    effort <= 3 ? 'low' : effort <= 6 ? 'medium' : 'high'

  let triggered = OPP_CANDIDATES.filter(c => c.trigger(a))

  const hasSpecificReporting = triggered.some(c => c.id === 'opp-reporting')
  if (hasSpecificReporting) {
    triggered = triggered.filter(c => c.id !== 'opp-cross-reporting')
  }

  // Use proportional weighting based on actual impact scores
  const totalImpact = triggered.reduce((sum, c) => sum + c.impact, 0)
  const rate = getRate(currencyCode)

  const opps: RankedOpportunity[] = triggered.map(c => {
    let projectedROINote: string
    let estimatedSavingsLocal: number | null = null // FIX #8: numeric field per-opportunity

    if (totalAnnualSavingsUSD && totalAnnualSavingsUSD > 0 && totalImpact > 0) {
      const weight = c.impact / totalImpact
      const oppSavingsUSD = totalAnnualSavingsUSD * weight
      estimatedSavingsLocal = oppSavingsUSD * rate
      projectedROINote = locale === 'id'
        ? `Estimasi penghematan ${formatCurrency(oppSavingsUSD, currencyCode)}/tahun pada target otomasi`
        : `Est. ${formatCurrency(oppSavingsUSD, currencyCode)}/yr savings at target automation`
    } else if (c.id === 'opp-sales-intelligence') {
      projectedROINote = locale === 'id' ? 'Estimasi peningkatan pipeline 15-25%' : 'Est. 15-25% pipeline improvement'
    } else {
      projectedROINote = locale === 'id' ? 'Estimasi penghematan membutuhkan data anggaran & jam kerja' : 'Savings estimate requires budget & hours data'
    }

    const relevantScore = c.dataScoreKey === 'process' ? scores.process : scores.data

    return {
      id: c.id,
      title: locale === 'id' ? c.titleId : c.title,   // FIX #6: was `name`
      impact: c.impact,                        // FIX #6: was `impactScore`
      effort: c.effort,                        // FIX #6: was `effortScore`
      complexity: complexity(c.effort),        // FIX #6: was `errorComplexity`
      quadrant: classifyQuadrant(c.impact, c.effort),
      timeToValueWeeks: c.timeToValueWeeks,
      projectedROINote,
      estimatedSavingsLocal: estimatedSavingsLocal, // currency-neutral savings for OpportunityCard
      estimatedSavingsIDR: estimatedSavingsLocal, // @deprecated backward compat alias
      prerequisites: locale === 'id' ? c.prerequisitesId : c.prerequisites,
      dataReadiness: dataReadiness(relevantScore),
    }
  })

  // FIX #9: Rename sort params to oppA/oppB to avoid shadowing outer `a: DiagnosticAnswers`
  return opps.sort(
    (oppA, oppB) => (oppB.impact - oppA.impact) || (oppA.effort - oppB.effort)
  )
}

// ---- Risk classification ----

function classifyRisks(a: DiagnosticAnswers, scores: DimensionScores, locale: Locale = 'en'): RiskFlag[] {
  const risks: RiskFlag[] = []
  const id = locale === 'id'

  const compliance: string[] = Array.isArray(a.compliance_requirements)
    ? a.compliance_requirements
    : []
  if (compliance.some(c => c !== 'None')) {
    risks.push({
      id: 'risk-compliance',
      risk: id ? 'Persyaratan kepatuhan menambah beban implementasi' : 'Compliance requirements add implementation overhead',
      severity: 'MEDIUM',
      source: 'compliance_requirements',
      detected: true,
    })
  }

  if (scores.data < 50) {
    risks.push({
      id: 'risk-data-quality',
      risk: id ? 'Masalah kualitas data dapat menunda pelatihan model AI dan menurunkan akurasi' : 'Data quality issues may delay AI model training and reduce accuracy',
      severity: scores.data < 35 ? 'HIGH' : 'MEDIUM',
      source: 'data_quality',
      detected: true,
    })
  }

  if (
    a.leadership_alignment?.includes('No alignment') ||
    a.leadership_alignment?.includes('needs convincing')
  ) {
    risks.push({
      id: 'risk-leadership',
      risk: id ? 'Keselarasan kepemimpinan yang kurang dapat menghambat pendanaan inisiatif dan adopsi' : 'Insufficient leadership alignment may stall initiative funding and adoption',
      severity: 'HIGH',
      source: 'leadership_alignment',
      detected: true,
    })
  }

  if (a.change_readiness?.includes('Resistant')) {
    risks.push({
      id: 'risk-change',
      risk: id ? 'Resistensi organisasi terhadap perubahan dapat melemahkan adopsi' : 'Organisational resistance to change could undermine adoption',
      severity: 'HIGH',
      source: 'change_readiness',
      detected: true,
    })
  }

  if (a.budget_allocated?.includes('No budget')) {
    risks.push({
      id: 'risk-budget',
      risk: id ? 'Tidak adanya anggaran khusus meningkatkan risiko proyek terhenti di tengah implementasi' : 'No dedicated budget increases risk of project stalling mid-implementation',
      severity: 'HIGH',
      source: 'budget_allocated',
      detected: true,
    })
  }

  if (scores.process < 45) {
    risks.push({
      id: 'risk-process',
      risk: id ? 'Proses yang tidak terdokumentasi atau tidak terstandardisasi membuat otomasi rapuh' : 'Undocumented or unstandardized processes make automation fragile',
      severity: 'MEDIUM',
      source: 'process_documentation',
      detected: false,
    })
  }

  // FIX #10: Previously missing risk rules — caused 0 risks for cases that
  // clearly have constraint mismatches (confirmed under-detection in QA).

  // Budget vs Ambition
  const budgetMid = parseBudgetMidpointUSD(a.budget_range)
  const targetAuto = parsePct(a.target_automation)
  if (budgetMid !== null && budgetMid <= 5_000 && targetAuto !== null && targetAuto >= 75) {
    risks.push({
      id: 'risk-budget-ambition',
      risk: id
        ? 'Target otomasi 75–90% dalam 12 bulan sangat ambisius untuk anggaran di bawah $10rb, yang secara signifikan meningkatkan risiko keterlambatan jadwal.'
        : 'Target automation of 75–90% within 12 months is highly ambitious for a sub-$10k budget, significantly increasing timeline slippage risk.',
      severity: 'HIGH',
      source: 'budget_range',
      detected: true,
    })
  }

  // Solo operator single point of failure
  const ftes = parseFteCount(a.fte_count)
  const manualHrs = parseManualHoursWeekly(a.manual_hours_weekly)
  if ((ftes !== null && ftes <= 1) && (manualHrs !== null && manualHrs >= 10)) {
    risks.push({
      id: 'risk-solo-operator',
      risk: id
        ? 'Seluruh implementasi otomasi bergantung pada satu orang. Sakit, perluasan lingkup kerja yang tidak terkendali, atau pengalihan fokus dapat menghentikan seluruh program.'
        : 'All automation implementation depends on a single person. Illness, scope creep, or context switching can stall the entire program.',
      severity: 'MEDIUM',
      source: 'fte_count',
      detected: true,
    })
  }

  // Pre-revenue + sub-$10k budget
  const isPreRevenue =
    a.annual_revenue?.toLowerCase().includes('pre-revenue') ||
    a.annual_revenue?.toLowerCase().includes('startup')
  if (isPreRevenue && budgetMid !== null && budgetMid <= 5_000) {
    risks.push({
      id: 'risk-prerevenue-cash',
      risk: id
        ? 'Berinvestasi pada perangkat otomasi sebelum pendapatan stabil menciptakan risiko keuangan (runway) jika hasil otomasi memakan waktu lebih lama dari yang diproyeksikan.'
        : 'Investing in automation tooling before revenue is established creates financial runway risk if automation outcomes take longer than projected.',
      severity: 'MEDIUM',
      source: 'annual_revenue',
      detected: true,
    })
  }

  // Large automation gap
  const currentAuto = parsePct(a.automation_current)
  const timelineMonths = parseTimelineMonths(a.success_timeline)
  if (
    currentAuto !== null &&
    targetAuto !== null &&
    currentAuto <= 25 &&
    targetAuto >= 75 &&
    (timelineMonths === null || timelineMonths <= 12)
  ) {
    risks.push({
      id: 'risk-automation-gap',
      risk: id
        ? `Cakupan otomasi saat ini (~${Math.round(currentAuto)}%) dibandingkan dengan target (${Math.round(targetAuto)}%) menunjukkan kesenjangan ${Math.round(targetAuto - currentAuto)}% — ambisius untuk jangka waktu 12 bulan dan mungkin memerlukan implementasi bertahap.`
        : `Current automation coverage (~${Math.round(currentAuto)}%) vs target (${Math.round(targetAuto)}%) represents a ${Math.round(targetAuto - currentAuto)}% gap — ambitious for a 12-month timeline and may require phased implementation.`,
      severity: 'LOW',
      source: 'automation_current',
      detected: true,
    })
  }

  const order: Record<RiskFlag['severity'], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
  return risks.sort((rA, rB) => order[rA.severity] - order[rB.severity])
}

// ---- Room for Improvement ----

/**
 * Derives a prioritised list of improvement areas from the dimension scores,
 * detected risks, and quantitative inputs. Each item carries an operational
 * impact statement plus a concrete before → after picture. This is consumed by
 * the result page AND fed into the AI System Blueprint generator as extra
 * context, so it must be deterministic (no LLM / randomness).
 */
function buildRoomForImprovement(
  scores: DimensionScores,
  q: DiagnosticContext['quantitative'],
  a: DiagnosticAnswers,
  locale: Locale = 'en',
): ImprovementItem[] {
  const items: ImprovementItem[] = []
  const id = locale === 'id'

  const priorityFromScore = (score: number): ImprovementItem['priority'] =>
    score < 45 ? 'high' : score < 70 ? 'medium' : 'low'

  const currentAuto = q.currentAutomationPct ?? null
  const targetAuto = q.targetAutomationPct ?? null
  const manualHrs = q.totalManualHoursWeekly

  // --- Process dimension ---
  if (scores.process < 75) {
    items.push({
      id: 'rfi-process',
      area: 'Process',
      title: id ? 'Dokumentasikan & standardisasi alur kerja inti' : 'Document & standardise core workflows',
      priority: priorityFromScore(scores.process),
      currentState: id
        ? (a.process_documentation
          ? `Proses ${humanizeAnswerId('process_documentation', a.process_documentation)} terdokumentasi dan ${(a.workflow_standardization ? humanizeAnswerId('workflow_standardization', a.workflow_standardization) : 'sebagian terstandardisasi').toLowerCase()}.`
          : 'Proses utama hanya sebagian terdokumentasi dan terstandardisasi, sehingga otomasi menjadi rapuh.')
        : (a.process_documentation
          ? `Processes are ${String(a.process_documentation).toLowerCase()} documented and ${String(a.workflow_standardization || 'partially standardised').toLowerCase()}.`
          : 'Key processes are only partially documented and standardised, making automation fragile.'),
      recommendedAction: id
        ? 'Petakan 3–5 proses dengan volume tertinggi secara menyeluruh, catat input/output dan aturan pengambilan keputusan, lalu standardisasi variasinya menjadi satu alur baku sebelum melakukan otomasi.'
        : 'Map the top 3–5 highest-volume processes end-to-end, capture inputs/outputs and decision rules, and standardise variations into a single canonical flow before automating.',
      operationalImpact: id
        ? 'Proses yang terstandardisasi dan terdokumentasi mengurangi pengerjaan ulang saat otomasi, mempersingkat proses onboarding, dan membuat agen AI jauh lebih andal karena bekerja dengan input yang konsisten.'
        : 'Standardised, documented processes reduce automation rework, shorten onboarding, and make AI agents far more reliable because they act on consistent inputs.',
      before: id
        ? 'Setiap anggota tim menjalankan proses dengan cara yang sedikit berbeda; pengetahuan penting hanya ada di kepala masing-masing orang.'
        : 'Each team member runs the process slightly differently; tribal knowledge lives in people’s heads.',
      after: id
        ? 'Satu alur yang terdokumentasi dan terstandardisasi per proses — siap diserahkan ke agen AI atau karyawan baru tanpa perlu pelatihan ulang.'
        : 'One documented, standardised flow per process — ready to hand to an AI agent or new hire without retraining.',
    })
  }

  // --- Data dimension ---
  if (scores.data < 75) {
    items.push({
      id: 'rfi-data',
      area: 'Data',
      title: id ? 'Pusatkan & bersihkan data operasional' : 'Centralise & clean operational data',
      priority: priorityFromScore(scores.data),
      currentState: id
        ? (a.data_centralization
          ? `Data ${humanizeAnswerId('data_centralization', a.data_centralization).toLowerCase()}; ${a.data_quality ? humanizeAnswerId('data_quality', a.data_quality).toLowerCase() : 'kualitasnya bervariasi'}.`
          : 'Data tersebar di berbagai sistem dengan kualitas yang tidak konsisten, sehingga membatasi akurasi AI.')
        : (a.data_centralization
          ? `Data is ${String(a.data_centralization).toLowerCase()}; quality is ${String(a.data_quality || 'mixed').toLowerCase()}.`
          : 'Data is spread across systems with inconsistent quality, limiting AI accuracy.'),
      recommendedAction: id
        ? 'Satukan sumber data yang memasok alur kerja prioritas ke dalam satu sumber kebenaran (atau hubungkan melalui API), lalu tambahkan validasi dasar untuk memperbaiki masalah kualitas sejak data dimasukkan.'
        : 'Consolidate the data sources that feed the priority workflows into a single source of truth (or connect them via APIs), then add basic validation to fix quality issues at entry.',
      operationalImpact: id
        ? 'Data yang bersih dan terpusat adalah faktor pendorong terbesar untuk kualitas output AI — ini memangkas rekonsiliasi manual dan mengurangi penanganan kesalahan di tahap selanjutnya.'
        : 'Clean, centralised data is the single biggest driver of AI output quality — it cuts manual reconciliation and reduces error-handling downstream.',
      before: id
        ? 'Staf menarik dan merekonsiliasi data secara manual dari berbagai alat sebelum membuat keputusan atau laporan apa pun.'
        : 'Staff manually pull and reconcile data from multiple tools before any decision or report.',
      after: id
        ? 'Satu lapisan data yang terhubung memasok alur kerja secara otomatis — tanpa langkah rekonsiliasi manual.'
        : 'A single connected data layer feeds workflows automatically — no manual reconciliation step.',
    })
  }

  // --- Automation gap (operational) ---
  if (currentAuto !== null && targetAuto !== null && targetAuto - currentAuto >= 15) {
    // Keep the gap exact (e.g. 32.5%) — rounding here made this card disagree
    // with the Next Steps / Room for Improvement narratives built elsewhere.
    const gap = targetAuto - currentAuto
    const gapStr = formatGapPct(gap, locale)
    // Weekly hours actually recoverable by closing the gap — same formula as
    // calculateROI (manual hrs × gap × 75% efficiency), so this narrative can
    // never disagree with the report's "Hours Reclaimed/yr" figure.
    const weeklyReclaimable =
      manualHrs != null ? Math.round(manualHrs * (gap / 100) * 0.75) : null
    items.push({
      id: 'rfi-automation-gap',
      area: 'Automation Coverage',
      title: id ? `Tutup Kesenjangan Otomasi (${gapStr})` : `Close the Automation Gap (${gapStr})`,
      priority: gap >= 40 ? 'high' : 'medium',
      currentState: id
        ? `Tim Anda saat ini mengotomasi ${formatGapPct(currentAuto, locale)} dari pekerjaan yang menjadi ruang lingkup, sementara target yang ditetapkan adalah ${formatGapPct(targetAuto, locale)}. Selisih ${gapStr} di antaranya adalah pekerjaan berulang yang masih dikerjakan secara manual — peluang paling langsung untuk efisiensi yang belum tergarap.`
        : `Your team currently automates ${formatGapPct(currentAuto, locale)} of in-scope work against a stated target of ${formatGapPct(targetAuto, locale)}. The ${gapStr} between them is repetitive work still handled manually — your most immediate opportunity for untapped efficiency.`,
      recommendedAction: id
        ? 'Urutkan otomasi secara bertahap — mulai dari tugas dengan volume tertinggi dan kompleksitas terendah (quick win) untuk membangun momentum, lalu perluas ke alur kerja multi-langkah.'
        : 'Sequence automation in phases — start with the highest-volume, lowest-complexity tasks (quick wins) to build momentum, then expand to multi-step workflows.',
      operationalImpact: id
        ? (weeklyReclaimable != null
          ? `Menutup kesenjangan ini akan mengubah sekitar ${weeklyReclaimable} dari ~${manualHrs} jam kerja manual/minggu menjadi kapasitas terotomasi (setelah faktor efisiensi 75%), sehingga membebaskan tim untuk tugas yang lebih bernilai.`
          : 'Menutup kesenjangan ini mengalihkan usaha manual yang berulang ke pekerjaan yang lebih bernilai.')
        : (weeklyReclaimable != null
          ? `Closing this gap converts roughly ${weeklyReclaimable} of the ~${manualHrs} manual hours/week into automated capacity (after a 75% efficiency factor), freeing the team for higher-value tasks.`
          : 'Closing this gap redirects repetitive manual effort toward higher-value work.'),
      before: id
        ? `Sekitar ${formatGapPct(100 - currentAuto, locale)} dari pekerjaan dalam ruang lingkup masih dikerjakan secara manual dan berulang.`
        : `Roughly ${formatGapPct(100 - currentAuto, locale)} of in-scope work is still manual and repetitive.`,
      after: id
        ? `Hingga ${formatGapPct(targetAuto, locale)} dari pekerjaan dalam ruang lingkup berjalan otomatis, dengan pengawasan manusia hanya pada pengecualian.`
        : `Up to ${formatGapPct(targetAuto, locale)} of in-scope work runs automatically with human oversight only on exceptions.`,
    })
  }

  // --- Strategy dimension ---
  if (scores.strategy < 70) {
    items.push({
      id: 'rfi-strategy',
      area: 'Strategy',
      title: id ? 'Kaitkan otomasi dengan KPI yang terukur' : 'Tie automation to measurable KPIs',
      priority: priorityFromScore(scores.strategy),
      currentState: id
        ? (a.kpi_tracking
          ? `Keberhasilan dilacak melalui ${humanizeAnswerId('kpi_tracking', a.kpi_tracking).toLowerCase()}; tujuan belum sepenuhnya terukur.`
          : 'Tujuan belum dikaitkan dengan metrik spesifik yang terlacak.')
        : (a.kpi_tracking
          ? `Success is tracked via ${String(a.kpi_tracking).toLowerCase()}; objectives are not yet fully quantified.`
          : 'Goals are not yet tied to specific, tracked metrics.'),
      recommendedAction: id
        ? 'Tetapkan 2–3 KPI terukur per otomasi (misalnya jam yang dihemat/minggu, waktu siklus, tingkat kesalahan) dan hubungkan ke dasbor otomatis sejak hari pertama.'
        : 'Define 2–3 quantified KPIs per automation (e.g. hours saved/week, cycle time, error rate) and wire them into an automated dashboard from day one.',
      operationalImpact: id
        ? 'KPI yang terukur memungkinkan Anda membuktikan ROI lebih awal, memprioritaskan otomasi berikutnya, dan menangkap kemunduran sebelum membesar.'
        : 'Measurable KPIs let you prove ROI early, prioritise the next automation, and catch regressions before they compound.',
      before: id ? 'Dampak otomasi dirasakan secara anekdotal namun tidak terukur.' : 'Impact of automation is felt anecdotally but not measured.',
      after: id ? 'Setiap otomasi melaporkan metrik secara langsung, sehingga ROI dan prioritas berikutnya menjadi jelas.' : 'Every automation reports live metrics, making ROI and next priorities obvious.',
    })
  }

  // --- People dimension ---
  if (scores.people < 65) {
    items.push({
      id: 'rfi-people',
      area: 'People',
      title: id ? 'Bangun kepemilikan AI internal' : 'Build internal AI ownership',
      priority: priorityFromScore(scores.people),
      currentState: id
        ? (a.internal_capability
          ? `Kapabilitas internal: ${humanizeAnswerId('internal_capability', a.internal_capability).toLowerCase()}.`
          : 'Kapabilitas internal terbatas untuk memiliki dan mengembangkan otomasi.')
        : (a.internal_capability
          ? `Internal capability: ${String(a.internal_capability).toLowerCase()}.`
          : 'Limited internal capability to own and extend automations.'),
      recommendedAction: id
        ? 'Tetapkan seorang "juru bicara otomasi" internal, libatkan mereka dalam implementasi, dan dokumentasikan runbook agar tim dapat memelihara alur kerja tanpa bantuan eksternal.'
        : 'Designate an internal "automation champion", pair them with the implementation, and document runbooks so the team can maintain workflows without external help.',
      operationalImpact: id
        ? 'Kepemilikan internal mencegah otomasi menjadi usang dan mengurangi ketergantungan pada vendor eksternal untuk setiap perubahan.'
        : 'Internal ownership prevents automations from going stale and reduces dependence on outside vendors for every change.',
      before: id ? 'Setiap perubahan alur kerja membutuhkan bantuan eksternal atau justru terhambat.' : 'Every workflow change requires external help or stalls.',
      after: id ? 'Seorang pemilik internal memelihara dan mengembangkan otomasi secara mandiri.' : 'An internal owner maintains and extends automations independently.',
    })
  }

  // --- Governance dimension ---
  if (scores.governance < 65) {
    items.push({
      id: 'rfi-governance',
      area: 'Governance',
      title: id ? 'Bangun pagar pembatas anggaran & pengawasan' : 'Establish budget & oversight guardrails',
      priority: priorityFromScore(scores.governance),
      currentState: id
        ? (a.budget_allocated
          ? `Posisi anggaran: ${humanizeAnswerId('budget_allocated', a.budget_allocated).toLowerCase()}; keselarasan kepemimpinan: ${(a.leadership_alignment ? humanizeAnswerId('leadership_alignment', a.leadership_alignment) : 'belum jelas').toLowerCase()}.`
          : 'Kepemilikan anggaran dan pengawasan untuk otomasi belum terformalisasi.')
        : (a.budget_allocated
          ? `Budget posture: ${String(a.budget_allocated).toLowerCase()}; leadership alignment: ${String(a.leadership_alignment || 'unclear').toLowerCase()}.`
          : 'Budget ownership and oversight for automation are not yet formalized.'),
      recommendedAction: id
        ? 'Amankan alokasi anggaran khusus untuk otomasi, tetapkan alur persetujuan dan tinjauan yang sederhana, serta tetapkan akuntabilitas yang jelas atas hasilnya.'
        : 'Secure a ring-fenced budget line for automation, define a simple approval and review cadence, and assign clear accountability for outcomes.',
      operationalImpact: id
        ? 'Pagar pembatas yang jelas mencegah proyek terhenti di tengah jalan dan memastikan otomasi tetap terdanai, ditinjau, dan sejalan dengan prioritas.'
        : 'Clear guardrails prevent mid-project stalls and ensure automations stay funded, reviewed, and aligned with priorities.',
      before: id ? 'Pekerjaan otomasi bersaing secara ad-hoc untuk mendapatkan pendanaan dan perhatian.' : 'Automation work competes ad-hoc for funding and attention.',
      after: id ? 'Anggaran khusus dan alur tinjauan rutin menjaga program tetap pada jalurnya.' : 'A dedicated budget and review cadence keep the program on track.',
    })
  }

  // Sort by priority: high → medium → low
  const order: Record<ImprovementItem['priority'], number> = { high: 0, medium: 1, low: 2 }
  return items.sort((x, y) => order[x.priority] - order[y.priority])
}

// ---- Main export ----

export function buildDiagnosticContext(answers: DiagnosticAnswers): DiagnosticContext {
  const companyName = answers.companyName || answers.company_name || 'Your Organisation'
  const currencyCode = parseCurrencyCode(answers.currency)

  const currentAutoPct = parsePct(answers.automation_current)
  const targetAutoPct = answers.target_automation ? parsePct(answers.target_automation) : 70
  const budgetMidpointUSD = parseBudgetMidpointUSD(answers.budget_range)
  const timelineMonths = parseTimelineMonths(answers.success_timeline)
  const totalManualHoursWeekly = parseManualHoursWeekly(answers.manual_hours_weekly)
  const fteCountInScope = parseFteCount(answers.fte_count)

  const quantitative: DiagnosticContext['quantitative'] = {
    ticketVolumePerDay: null,
    ahtCurrentMinutes: null,
    ahtTargetMinutes: null,
    costCurrentPerTicket: null,
    costTargetPerTicket: null,
    totalManualHoursWeekly,
    fteCountInScope,
    currentAutomationPct: currentAutoPct,
    targetAutomationPct: targetAutoPct,
    budgetMidpointUSD,
    timelineMonths,
  }

  const scores = calculateDimensionScores(answers)

  // FIX #3: Pass industry to calculateROI for correct labor rate
  const calculations = calculateROI(quantitative, currencyCode, answers.industry)

  // D2 — damp the completeness-based confidence by how the manual-hours / FTE
  // estimates were sourced. Absent answer → neutral, so pre-D2 behaviour is
  // preserved exactly. Only the qualitative label changes; every figure above
  // is already computed and untouched.
  calculations.confidenceLevel = dampConfidenceByEstimateBasis(
    calculations.confidenceLevel,
    answers.estimate_basis,
  )

  const { totalAnnualSavingsUSD } = calculations

  const opportunities = rankOpportunities(answers, scores, currencyCode, totalAnnualSavingsUSD, 'en')
  // Bahasa Indonesia phase 2 — computed once, alongside the English version,
  // and stored on the context (never recomputed on a locale toggle). Same
  // numeric/decision fields as `opportunities`, only the prose differs.
  const opportunitiesId = rankOpportunities(answers, scores, currencyCode, totalAnnualSavingsUSD, 'id')
  const risks = classifyRisks(answers, scores, 'en')
  const risksId = classifyRisks(answers, scores, 'id')
  const roomForImprovement = buildRoomForImprovement(scores, quantitative, answers, 'en')
  const roomForImprovementId = buildRoomForImprovement(scores, quantitative, answers, 'id')
  // Phase E1.2 — pure read-only derived pass over the same raw answers;
  // never touches scores/calculations. See computeScoreDrivers above.
  const scoreDrivers = computeScoreDrivers(answers, 'en')
  const scoreDriversId = computeScoreDrivers(answers, 'id')

  const compliance: string[] = Array.isArray(answers.compliance_requirements)
    ? answers.compliance_requirements.filter((c: string) => c !== 'None')
    : []

  const qualitative: DiagnosticContext['qualitative'] = {
    primaryObjective: answers.primary_objective || '',
    topPainPoints: answers.pain_points || '',
    compliance,
    implementApproach: answers.preferred_approach || '',
    aiCapability: answers.internal_capability || '',
    leadershipAlignment: answers.leadership_alignment || '',
    priorAIAttempts: answers.prior_ai_attempts || '',
    resistanceSources: [],
    delayConsequence: answers.delay_consequence || '',
    errorTolerance: answers.risk_tolerance || '',
    dataResidency: answers.data_residency || '',
    annualRevenue: answers.annual_revenue || '',
    industry: answers.industry || '',
    // Slice-2 optional answers — context/narrative only, never read by any
    // scoreX() function or the driver table above.
    kpiBaseline: answers.kpi_baseline || '',
    processOwnership: answers.process_ownership || '',
    painPointHours: answers.pain_point_hours || '',
    // D2 — persisted so upgradeDiagnosticContext can re-apply the confidence
    // damper after any ROI recompute. Narrative/context only; never scored.
    estimateBasis: answers.estimate_basis || '',
  }

  const context: DiagnosticContext = {
    company: companyName,
    currency: currencyCode,
    submittedAt: new Date().toISOString(),
    quantitative,
    calculations,
    scores,
    opportunities,
    opportunitiesId,
    risks,
    risksId,
    roomForImprovement,
    roomForImprovementId,
    scoreDrivers,
    scoreDriversId,
    qualitative,
  }

  try {
    localStorage.setItem('aivory_diagnostic_context', JSON.stringify(context))
  } catch {
    // localStorage unavailable (SSR or quota exceeded) — silently continue
  }

  // Async per-user Postgres write for DiagnosticContext — fire-and-forget
  if (typeof window !== 'undefined') {
    import('@/lib/reportStorage').then(({ saveDiagnosticContext }) => {
      saveDiagnosticContext(context).catch((err) => {
        console.error('[buildDiagnosticContext] server save failed:', err)
      })
    }).catch(() => { /* reportStorage unavailable */ })
  }

  return context
}


// ---- Backward-compatible upgrade for stored (old) diagnostic contexts ----

/**
 * Upgrades a previously-stored DiagnosticContext so that results created before
 * the ROI methodology fix and the "Room for Improvement" feature show the new
 * data WITHOUT requiring the user to retake the diagnostic.
 *
 * It recomputes:
 *  - `calculations` using the corrected labor-rate methodology + transparency
 *    fields (only when the stored context lacks `assumedHourlyRateUSD`).
 *  - `roomForImprovement` from the stored scores + quantitative inputs
 *    (only when missing).
 *
 * It also regenerates `opportunities` when the stored list is empty (legacy
 * contexts persisted by older builds) — see the healing block below.
 * Everything else (scores, risks, qualitative) is preserved.
 * The upgraded context is re-persisted to localStorage so the blueprint
 * generator and subsequent loads also benefit, and we avoid recomputing on
 * every render. The function is idempotent and pure for already-upgraded input.
 */
export function upgradeDiagnosticContext(
  context: DiagnosticContext,
  industryHint?: string,
): DiagnosticContext {
  if (!context || typeof context !== 'object') return context

  let changed = false
  let calculations = context.calculations

  // Old calculations lack the transparency fields → they were produced by the
  // buggy flat-$8/hr or flat-$15/hr methodology. Recompute with the corrected logic.
  //
  // We re-run ROI if:
  //   a) The transparency fields are missing entirely (very old context), OR
  //   b) assumedHourlyRateUSD is ≤ 15 — indicates the old buggy $8 or $15 fallback
  //      was used instead of the industry-aware rate.
  const calc = calculations as Partial<ROIProjection> | undefined
  const storedRate = calc?.assumedHourlyRateUSD
  const needsRoiUpgrade =
    !!context.quantitative &&
    (
      !calc ||
      storedRate === undefined ||
      storedRate === null ||
      storedRate <= 15   // $8 or $15 = old default fallback, not industry-aware
    )

  if (needsRoiUpgrade) {
    const currencyCode = parseCurrencyCode(context.currency)

    // Industry resolution priority:
    //  1. Explicit hint passed in (from saved progress)
    //  2. Stored in qualitative.industry (new contexts)
    //  3. Infer from scores: high strategy (≥70) + high data (≥60) → Tech proxy
    //  4. Use $30/hr default (not $15) if completely unknown
    let industry = industryHint ?? context.qualitative?.industry ?? undefined

    if (!industry && context.scores) {
      const { strategy = 0, data = 0, people = 0 } = context.scores
      if (strategy >= 70 && data >= 50 && people >= 70) {
        // High-scoring orgs in all three dimensions are typically tech/software companies
        industry = 'Technology / Software'
      } else if (data >= 60) {
        industry = 'Finance / Banking'  // data-heavy but lower people/strategy
      }
      // Otherwise leave undefined → DEFAULT_HOURLY_RATE_USD ($30) kicks in
    }

    calculations = calculateROI(context.quantitative, currencyCode, industry)
    // D2 — the recompute above resets confidence to the raw completeness-based
    // value, so re-apply the estimate-basis damper from the stored answer.
    // Pre-D2 contexts have no `estimateBasis` → neutral no-op → identical to
    // today (no regression on legacy reports).
    calculations = {
      ...calculations,
      confidenceLevel: dampConfidenceByEstimateBasis(
        calculations.confidenceLevel,
        context.qualitative?.estimateBasis,
      ),
    }
    changed = true
  }

  // Generate Room for Improvement if the stored context predates the feature.
  let roomForImprovement = context.roomForImprovement
  if (
    (true /* always regenerate roomForImprovement from latest logic */) &&
    context.scores &&
    context.quantitative
  ) {
    roomForImprovement = buildRoomForImprovement(context.scores, context.quantitative, {
      // Provide whatever descriptive hints we still have; the builder falls
      // back to generic copy when specific answer fields are absent.
      internal_capability: context.qualitative?.aiCapability,
      leadership_alignment: context.qualitative?.leadershipAlignment,
    })
    changed = true
  }

  // Heal legacy contexts whose stored opportunity list is empty. The current
  // rankOpportunities always returns at least one candidate (the always-on
  // cross-system reporting fallback), so an empty array can only mean the
  // context was persisted by an older build — regenerate from what the
  // context still carries instead of preserving a hole in the report forever.
  let opportunities = context.opportunities
  if ((!Array.isArray(opportunities) || opportunities.length === 0) && context.scores) {
    const currencyCode = parseCurrencyCode(context.currency)
    const approxAnswers: DiagnosticAnswers = {}
    if (typeof context.qualitative?.topPainPoints === 'string') {
      approxAnswers.pain_points = context.qualitative.topPainPoints
    }
    opportunities = rankOpportunities(
      approxAnswers,
      context.scores,
      currencyCode,
      (calculations as Partial<ROIProjection> | undefined)?.totalAnnualSavingsUSD ?? null,
    )
    changed = true
  }

  if (!changed) return context

  const upgraded: DiagnosticContext = { ...context, calculations, roomForImprovement, opportunities }

  try {
    localStorage.setItem('aivory_diagnostic_context', JSON.stringify(upgraded))
  } catch {
    // localStorage unavailable — return the upgraded object anyway
  }

  return upgraded
}
