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

  // FIX #3: Use industry-aware hourly rate
  // Fix 2 (Run 3): For solo/micro teams (1–5 FTEs), reclaimed hours are
  // opportunity cost, not payroll savings — use $8/hr instead of the full
  // industry blended rate. 6+ FTEs use the normal industry rate.
  const baseHourlyRateUSD = getHourlyRateUSD(industry)
  const hourlyRateUSD = (q.fteCountInScope ?? 1) <= 5 ? 8 : baseHourlyRateUSD

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
      budgetMidpointUSD: budgetUSD,
      totalAnnualSavingsUSD,
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
      risk: `Current automation coverage (~${Math.round(currentAuto)}%) vs target (${Math.round(targetAuto)}%) represents a ${Math.round(targetAuto - currentAuto)}pp gap — aggressive for a 12-month window and may require phased re-scoping.`,
      severity: 'LOW',
      source: 'automation_current',
      detected: true,
    })
  }

  const order: Record<RiskFlag['severity'], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
  return risks.sort((rA, rB) => order[rA.severity] - order[rB.severity])
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