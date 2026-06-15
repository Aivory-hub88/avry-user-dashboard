import {
  PhaseId,
  PhaseConfig,
  DeepDiagnosticProgress,
  DeepDiagnosticResponse,
  DeepDiagnosticResult
} from '@/types/deepDiagnostic'
import type { BlueprintV1 } from '@/types/blueprint'
import {
  saveDeepDiagnosticResult as _supabaseSaveResult,
  loadDeepDiagnosticResult as _supabaseLoadResult,
} from '@/lib/supabaseStorage'
import { isMisconfigured as _supabaseMisconfigured } from '@/lib/supabaseClient'

// In-memory fallback when localStorage is unavailable
let _memoryProgress: DeepDiagnosticProgress | null = null

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
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120_000)

    let response: Response
    try {
      response = await fetch('/api/diagnostics/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: organizationId, mode: 'deep', phases }),
        signal: controller.signal,
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') throw new Error('Request timed out. Please try again.')
      throw err
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to submit diagnostic' }))
      throw new Error(error.message || 'Failed to submit diagnostic')
    }

    const result: DeepDiagnosticResponse = await response.json()
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

  /**
   * Saves a diagnostic result.
   * Dual-writes to Supabase + localStorage (Req 3.1).
   * Falls back to localStorage-only if Supabase is not configured.
   * organizationId defaults to 'demo_org' when not provided.
   */
  static saveResult(result: DeepDiagnosticResult, organizationId: string = 'demo_org'): void {
    if (_supabaseMisconfigured) {
      // Supabase not configured — write to localStorage only
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(this.RESULT_KEY, JSON.stringify(result))
        } catch (error) {
          console.error('[DeepDiagnostic] Failed to save result to localStorage:', error)
        }
      }
      return
    }

    // Fire-and-forget Supabase + localStorage dual-write (Req 3.1)
    _supabaseSaveResult(result, organizationId).catch((err) => {
      // Both stores failed — log but don't crash the caller
      console.error('[DeepDiagnostic] saveResult dual-write failed:', err)
    })
  }

  /**
   * Loads a diagnostic result.
   * Tries Supabase first; falls back to localStorage (Req 3.4 – 3.6).
   * Returns a Promise — callers that need the value must await it.
   * For backward-compat, a synchronous localStorage-only path is used when
   * Supabase is not configured.
   */
  static loadResult(organizationId: string = 'demo_org'): DeepDiagnosticResult | null {
    // Synchronous localStorage-only path when Supabase is not configured
    if (_supabaseMisconfigured) {
      if (typeof window === 'undefined') return null
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
    }

    // When Supabase is configured, return localStorage value immediately for
    // synchronous callers, and kick off an async Supabase fetch in the background
    // to keep localStorage in sync for the next load.
    const localResult = (() => {
      if (typeof window === 'undefined') return null
      try {
        const stored = localStorage.getItem(this.RESULT_KEY)
        if (!stored) return null
        const result = JSON.parse(stored) as DeepDiagnosticResult
        const hasScore =
          typeof result.score === 'number' ||
          typeof (result as any).ai_readiness_score === 'number'
        if (!result.diagnostic_id || !hasScore) return null
        if (typeof result.score !== 'number' && typeof (result as any).ai_readiness_score === 'number') {
          (result as any).score = (result as any).ai_readiness_score
        }
        return result
      } catch { return null }
    })()

    // Background sync: fetch from Supabase and update localStorage cache
    _supabaseLoadResult(organizationId).catch(() => { /* silent — localStorage already returned */ })

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
    organizationId: string = 'demo_org',
    objective: string = 'AI readiness improvement',
    diagnosticData?: Record<string, any>
  ): Promise<BlueprintV1> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120_000)

    let response: Response
    try {
      response = await fetch('/api/blueprints/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diagnostic_id: diagnosticId,
          organization_id: organizationId,
          objective,
          ...(diagnosticData ? { diagnostic_data: diagnosticData } : {}),
        }),
        signal: controller.signal,
      })
    } catch (err: any) {
      if (err?.name === 'AbortError')
        throw new Error('Blueprint generation timed out. Please try again.')
      throw err
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to generate blueprint' }))
      throw new Error(error.message || 'Failed to generate blueprint')
    }

    const blueprint: BlueprintV1 = await response.json()

    // Dual-write blueprint to Supabase + localStorage (Req 4.1)
    if (!_supabaseMisconfigured) {
      const { saveBlueprint: _supabaseSaveBlueprint } = await import('@/lib/supabaseStorage')
      _supabaseSaveBlueprint(blueprint, organizationId).catch((err) => {
        console.error('[DeepDiagnostic] generateBlueprint Supabase save failed:', err)
      })
    } else {
      // Supabase not configured — write to localStorage only
      if (typeof window !== 'undefined') {
        try { localStorage.setItem('aivory_blueprint', JSON.stringify(blueprint)) } catch { /* ignore */ }
      }
    }

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

const CURRENCY_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  IDR: 15_600,
  SGD: 1.35,
  MYR: 4.72,
  AUD: 1.53,
  JPY: 149,
  INR: 83,
}

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

// ---- ROI calculation ----

interface ROIProjectionInternal extends ROIProjection {
  // totalAnnualSavingsUSD is already on ROIProjection (Bug 3 fix)
}

function calculateROI(
  q: DiagnosticContext['quantitative'],
  currencyCode: CurrencyCode = 'USD',
  industry: string | undefined = undefined
): ROIProjectionInternal {
  const rate = CURRENCY_RATES[currencyCode] ?? 1
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
  const baseHourlyRateUSD = getHourlyRateUSD(industry)
  const smallTeamRateApplied = (q.fteCountInScope ?? 1) <= 5
  const hourlyRateUSD = smallTeamRateApplied
    ? Math.round(baseHourlyRateUSD * SMALL_TEAM_RATE_FACTOR)
    : baseHourlyRateUSD

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
  const EFFICIENCY_FACTOR = 0.75
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

  // Bug 3 — Audit log: always log budgetMidpointUSD alongside the ROI result
  // so the formula is auditable: ((totalAnnualSavingsUSD × 3 − investment) / investment) × 100
  if (process.env.NODE_ENV !== 'test') {
    console.log('[ROI Audit]', {
      industry: industry ?? 'unknown',
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
    // Backward-compat aliases for any stored DiagnosticContext that still uses *IDR names
    annualLaborSavingsIDR: annualLaborSavingsUSD ? annualLaborSavingsUSD * rate : null,
    annualProcessSavingsIDR: annualProcessSavingsUSD ? annualProcessSavingsUSD * rate : null,
    totalAnnualSavingsIDR: totalAnnualSavingsUSD ? totalAnnualSavingsUSD * rate : null,
    costOfInaction90DaysIDR: costOfInaction90DaysUSD ? costOfInaction90DaysUSD * rate : null,
  }
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

function maturityFromScore(composite: number): MaturityLevel {
  if (composite >= 80) return 'Optimizing'
  if (composite >= 65) return 'Defined'
  if (composite >= 50) return 'Developing'
  if (composite >= 35) return 'Initiating'
  return 'Nascent'
}

function calculateDimensionScores(a: DiagnosticAnswers): DimensionScores {
  const strategy = scoreStrategy(a)
  const data = scoreData(a)
  const process = scoreProcess(a)
  const people = scorePeople(a)
  const governance = scoreGovernance(a)

  const composite = Math.round(
    strategy * 0.25 + data * 0.25 + process * 0.2 + people * 0.15 + governance * 0.15
  )

  const dims: Record<DimensionKey, number> = { strategy, data, process, people, governance }
  const entries = Object.entries(dims) as [DimensionKey, number][]
  const strongest = entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
  const weakest = entries.reduce((a, b) => (b[1] < a[1] ? b : a))[0]

  return {
    strategy, data, process, people, governance,
    composite,
    maturityLevel: maturityFromScore(composite),
    strongestDimension: strongest,
    weakestDimension: weakest,
  }
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
  impact: number
  effort: number
  timeToValueWeeks: number
  prerequisites: string[]
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
    impact: 9, effort: 5, timeToValueWeeks: 8,
    prerequisites: [],
    dataScoreKey: 'data',
    trigger: (a) =>
      hasPriorityArea(a, 'customer service') ||
      !!a.pain_points?.toLowerCase().includes('ticket') ||
      !!a.pain_points?.toLowerCase().includes('support'),
  },
  {
    id: 'opp-process-automation',
    title: 'Process Automation',   // FIX #6
    impact: 8, effort: 5, timeToValueWeeks: 8,
    prerequisites: [],
    dataScoreKey: 'process',
    trigger: (a) =>
      hasPriorityArea(a, 'operations') ||
      !!a.manual_processes?.toLowerCase().includes('process'),
  },
  {
    id: 'opp-reporting',
    title: 'Automated Reporting',  // FIX #6
    impact: 7, effort: 4, timeToValueWeeks: 5,
    prerequisites: [],
    dataScoreKey: 'data',
    trigger: (a) =>
      hasPriorityArea(a, 'data analysis') ||
      hasPriorityArea(a, 'reporting') ||
      !!a.manual_processes?.toLowerCase().includes('report'),
  },
  {
    id: 'opp-sales-intelligence',
    title: 'Sales Intelligence',   // FIX #6
    impact: 7, effort: 6, timeToValueWeeks: 10,
    prerequisites: ['CRM integration'],
    dataScoreKey: 'data',
    trigger: (a) => hasPriorityArea(a, 'sales'),
  },
  {
    id: 'opp-cross-reporting',
    title: 'Cross-system Reporting',  // FIX #6
    impact: 6, effort: 5, timeToValueWeeks: 5,
    prerequisites: [],
    dataScoreKey: 'data',
    trigger: () => true,
  },
]

function rankOpportunities(
  a: DiagnosticAnswers,
  scores: DimensionScores,
  currencyCode: CurrencyCode = 'USD',
  totalAnnualSavingsUSD: number | null = null
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
  const rate = CURRENCY_RATES[currencyCode] ?? 1

  const opps: RankedOpportunity[] = triggered.map(c => {
    let projectedROINote: string
    let estimatedSavingsLocal: number | null = null // FIX #8: numeric field per-opportunity

    if (totalAnnualSavingsUSD && totalAnnualSavingsUSD > 0 && totalImpact > 0) {
      const weight = c.impact / totalImpact
      const oppSavingsUSD = totalAnnualSavingsUSD * weight
      estimatedSavingsLocal = oppSavingsUSD * rate
      projectedROINote = `Est. ${formatCurrency(oppSavingsUSD, currencyCode)}/yr savings at target automation`
    } else if (c.id === 'opp-sales-intelligence') {
      projectedROINote = 'Est. 15-25% pipeline improvement'
    } else {
      projectedROINote = 'Savings estimate requires budget & hours data'
    }

    const relevantScore = c.dataScoreKey === 'process' ? scores.process : scores.data

    return {
      id: c.id,
      title: c.title,                          // FIX #6: was `name`
      impact: c.impact,                        // FIX #6: was `impactScore`
      effort: c.effort,                        // FIX #6: was `effortScore`
      complexity: complexity(c.effort),        // FIX #6: was `errorComplexity`
      quadrant: classifyQuadrant(c.impact, c.effort),
      timeToValueWeeks: c.timeToValueWeeks,
      projectedROINote,
      estimatedSavingsLocal: estimatedSavingsLocal, // currency-neutral savings for OpportunityCard
      estimatedSavingsIDR: estimatedSavingsLocal, // @deprecated backward compat alias
      prerequisites: c.prerequisites,
      dataReadiness: dataReadiness(relevantScore),
    }
  })

  // FIX #9: Rename sort params to oppA/oppB to avoid shadowing outer `a: DiagnosticAnswers`
  return opps.sort(
    (oppA, oppB) => (oppB.impact - oppA.impact) || (oppA.effort - oppB.effort)
  )
}

// ---- Risk classification ----

function classifyRisks(a: DiagnosticAnswers, scores: DimensionScores): RiskFlag[] {
  const risks: RiskFlag[] = []

  const compliance: string[] = Array.isArray(a.compliance_requirements)
    ? a.compliance_requirements
    : []
  if (compliance.some(c => c !== 'None')) {
    risks.push({
      id: 'risk-compliance',
      risk: 'Compliance requirements add implementation overhead',
      severity: 'MEDIUM',
      source: 'compliance_requirements',
      detected: true,
    })
  }

  if (scores.data < 50) {
    risks.push({
      id: 'risk-data-quality',
      risk: 'Data quality issues may delay AI model training and reduce accuracy',
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
      risk: 'Insufficient leadership alignment may stall initiative funding and adoption',
      severity: 'HIGH',
      source: 'leadership_alignment',
      detected: true,
    })
  }

  if (a.change_readiness?.includes('Resistant')) {
    risks.push({
      id: 'risk-change',
      risk: 'Organizational resistance to change could undermine adoption',
      severity: 'HIGH',
      source: 'change_readiness',
      detected: true,
    })
  }

  if (a.budget_allocated?.includes('No budget')) {
    risks.push({
      id: 'risk-budget',
      risk: 'No dedicated budget increases risk of project stalling mid-implementation',
      severity: 'HIGH',
      source: 'budget_allocated',
      detected: true,
    })
  }

  if (scores.process < 45) {
    risks.push({
      id: 'risk-process',
      risk: 'Undocumented or unstandardized processes make automation fragile',
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
      risk: 'Target automation of 75–90% within 12 months is highly ambitious for a sub-$10k budget, significantly increasing timeline slippage risk.',
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
      risk: 'All automation implementation depends on a single person. Illness, scope creep, or context switching can stall the entire program.',
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
      risk: 'Investing in automation tooling before revenue is established creates financial runway risk if automation outcomes take longer than projected.',
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
      risk: `Current automation coverage (~${Math.round(currentAuto)}%) vs target (${Math.round(targetAuto)}%) represents a ${Math.round(targetAuto - currentAuto)}% gap — ambitious for a 12-month timeline and may require phased implementation.`,
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
 * Derives a prioritized list of improvement areas from the dimension scores,
 * detected risks, and quantitative inputs. Each item carries an operational
 * impact statement plus a concrete before → after picture. This is consumed by
 * the result page AND fed into the AI System Blueprint generator as extra
 * context, so it must be deterministic (no LLM / randomness).
 */
function buildRoomForImprovement(
  scores: DimensionScores,
  q: DiagnosticContext['quantitative'],
  a: DiagnosticAnswers,
): ImprovementItem[] {
  const items: ImprovementItem[] = []

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
      title: 'Document & standardize core workflows',
      priority: priorityFromScore(scores.process),
      currentState:
        a.process_documentation
          ? `Processes are ${String(a.process_documentation).toLowerCase()} documented and ${String(a.workflow_standardization || 'partially standardized').toLowerCase()}.`
          : 'Key processes are only partially documented and standardized, making automation fragile.',
      recommendedAction:
        'Map the top 3–5 highest-volume processes end-to-end, capture inputs/outputs and decision rules, and standardize variations into a single canonical flow before automating.',
      operationalImpact:
        'Standardized, documented processes reduce automation rework, shorten onboarding, and make AI agents far more reliable because they act on consistent inputs.',
      before: 'Each team member runs the process slightly differently; tribal knowledge lives in people’s heads.',
      after: 'One documented, standardized flow per process — ready to hand to an AI agent or new hire without retraining.',
    })
  }

  // --- Data dimension ---
  if (scores.data < 75) {
    items.push({
      id: 'rfi-data',
      area: 'Data',
      title: 'Centralize & clean operational data',
      priority: priorityFromScore(scores.data),
      currentState:
        a.data_centralization
          ? `Data is ${String(a.data_centralization).toLowerCase()}; quality is ${String(a.data_quality || 'mixed').toLowerCase()}.`
          : 'Data is spread across systems with inconsistent quality, limiting AI accuracy.',
      recommendedAction:
        'Consolidate the data sources that feed the priority workflows into a single source of truth (or connect them via APIs), then add basic validation to fix quality issues at entry.',
      operationalImpact:
        'Clean, centralized data is the single biggest driver of AI output quality — it cuts manual reconciliation and reduces error-handling downstream.',
      before: 'Staff manually pull and reconcile data from multiple tools before any decision or report.',
      after: 'A single connected data layer feeds workflows automatically — no manual reconciliation step.',
    })
  }

  // --- Automation gap (operational) ---
  if (currentAuto !== null && targetAuto !== null && targetAuto - currentAuto >= 15) {
    const gap = Math.round(targetAuto - currentAuto)
    items.push({
      id: 'rfi-automation-gap',
      area: 'Automation Coverage',
      title: `Close the Automation Gap (${gap}%)`,
      priority: gap >= 40 ? 'high' : 'medium',
      currentState: `An automation gap of ${gap}% means that roughly ${gap}% of your repetitive operational tasks are still handled manually despite your automation goals. Closing this gap represents your most immediate opportunity for untapped efficiency.`,
      recommendedAction:
        'Sequence automation in phases — start with the highest-volume, lowest-complexity tasks (quick wins) to build momentum, then expand to multi-step workflows.',
      operationalImpact:
        manualHrs
          ? `Closing this gap targets the ~${manualHrs} manual hours/week currently spent on repetitive work, freeing the team for higher-value tasks.`
          : 'Closing this gap redirects repetitive manual effort toward higher-value work.',
      before: `Roughly ${100 - Math.round(currentAuto)}% of in-scope work is still manual and repetitive.`,
      after: `Up to ${Math.round(targetAuto)}% of in-scope work runs automatically with human oversight only on exceptions.`,
    })
  }

  // --- Strategy dimension ---
  if (scores.strategy < 70) {
    items.push({
      id: 'rfi-strategy',
      area: 'Strategy',
      title: 'Tie automation to measurable KPIs',
      priority: priorityFromScore(scores.strategy),
      currentState:
        a.kpi_tracking
          ? `Success is tracked via ${String(a.kpi_tracking).toLowerCase()}; objectives are not yet fully quantified.`
          : 'Goals are not yet tied to specific, tracked metrics.',
      recommendedAction:
        'Define 2–3 quantified KPIs per automation (e.g. hours saved/week, cycle time, error rate) and wire them into an automated dashboard from day one.',
      operationalImpact:
        'Measurable KPIs let you prove ROI early, prioritize the next automation, and catch regressions before they compound.',
      before: 'Impact of automation is felt anecdotally but not measured.',
      after: 'Every automation reports live metrics, making ROI and next priorities obvious.',
    })
  }

  // --- People dimension ---
  if (scores.people < 65) {
    items.push({
      id: 'rfi-people',
      area: 'People',
      title: 'Build internal AI ownership',
      priority: priorityFromScore(scores.people),
      currentState:
        a.internal_capability
          ? `Internal capability: ${String(a.internal_capability).toLowerCase()}.`
          : 'Limited internal capability to own and extend automations.',
      recommendedAction:
        'Designate an internal "automation champion", pair them with the implementation, and document runbooks so the team can maintain workflows without external help.',
      operationalImpact:
        'Internal ownership prevents automations from going stale and reduces dependence on outside vendors for every change.',
      before: 'Every workflow change requires external help or stalls.',
      after: 'An internal owner maintains and extends automations independently.',
    })
  }

  // --- Governance dimension ---
  if (scores.governance < 65) {
    items.push({
      id: 'rfi-governance',
      area: 'Governance',
      title: 'Establish budget & oversight guardrails',
      priority: priorityFromScore(scores.governance),
      currentState:
        a.budget_allocated
          ? `Budget posture: ${String(a.budget_allocated).toLowerCase()}; leadership alignment: ${String(a.leadership_alignment || 'unclear').toLowerCase()}.`
          : 'Budget ownership and oversight for automation are not yet formalized.',
      recommendedAction:
        'Secure a ring-fenced budget line for automation, define a simple approval and review cadence, and assign clear accountability for outcomes.',
      operationalImpact:
        'Clear guardrails prevent mid-project stalls and ensure automations stay funded, reviewed, and aligned with priorities.',
      before: 'Automation work competes ad-hoc for funding and attention.',
      after: 'A dedicated budget and review cadence keep the program on track.',
    })
  }

  // Sort by priority: high → medium → low
  const order: Record<ImprovementItem['priority'], number> = { high: 0, medium: 1, low: 2 }
  return items.sort((x, y) => order[x.priority] - order[y.priority])
}

// ---- Main export ----

export function buildDiagnosticContext(answers: DiagnosticAnswers): DiagnosticContext {
  const companyName = answers.companyName || answers.company_name || 'Your Organization'
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

  const { totalAnnualSavingsUSD } = calculations

  const opportunities = rankOpportunities(answers, scores, currencyCode, totalAnnualSavingsUSD)
  const risks = classifyRisks(answers, scores)
  const roomForImprovement = buildRoomForImprovement(scores, quantitative, answers)

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
  }

  const context: DiagnosticContext = {
    company: companyName,
    currency: currencyCode,
    submittedAt: new Date().toISOString(),
    quantitative,
    calculations,
    scores,
    opportunities,
    risks,
    roomForImprovement,
    qualitative,
  }

  try {
    localStorage.setItem('aivory_diagnostic_context', JSON.stringify(context))
  } catch {
    // localStorage unavailable (SSR or quota exceeded) — silently continue
  }

  // Async Supabase dual-write for DiagnosticContext (Req 6.1) — fire-and-forget
  if (typeof window !== 'undefined') {
    import('@/lib/supabaseStorage').then(({ saveDiagnosticContext }) => {
      saveDiagnosticContext(context, answers.companyName || answers.company_name || 'demo_org').catch((err) => {
        console.error('[buildDiagnosticContext] Supabase save failed:', err)
      })
    }).catch(() => { /* supabaseStorage unavailable */ })
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
 * Everything else (scores, opportunities, risks, qualitative) is preserved.
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

  if (!changed) return context

  const upgraded: DiagnosticContext = { ...context, calculations, roomForImprovement }

  try {
    localStorage.setItem('aivory_diagnostic_context', JSON.stringify(upgraded))
  } catch {
    // localStorage unavailable — return the upgraded object anyway
  }

  return upgraded
}
