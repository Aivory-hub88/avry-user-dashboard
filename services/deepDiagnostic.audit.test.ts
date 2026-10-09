/**
 * Regressions from the 2026-10-10 Deep Diagnostic audit: the result page's
 * upgrade pass stripping answer-specific Room-for-Improvement copy, broken
 * sentence templates, the ≤$15 recompute trigger matching valid rates, the
 * no-automation-gap case rendering as "high confidence −100%", and the
 * open "Over 100 hours/week" bucket ignoring headcount.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildDiagnosticContext,
  upgradeDiagnosticContext,
  calculateROI,
  reconcileManualHoursWithFte,
} from './deepDiagnostic'
import type { DiagnosticAnswers, DiagnosticContext } from '@/types/diagnostic'

const store: Record<string, string> = {}
beforeEach(() => {
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
  }
})

const BASE: DiagnosticAnswers = {
  currency: 'USD — US Dollar ($)',
  industry: 'Manufacturing',
  quantified_goal: 'Yes, but not quantified (e.g., improve efficiency)',
  kpi_tracking: 'Not currently tracked',
  success_timeline: '6-12 months',
  data_centralization: 'No centralization',
  data_quality: 'High quality, clean, and consistent',
  process_documentation: '0-25%',
  workflow_standardization: 'Some standardization, mostly ad-hoc',
  system_integration: 'No integration',
  automation_current: '10-25%',
  manual_hours_weekly: '25-50 hours/week',
  fte_count: '1-5 FTEs',
  budget_allocated: 'No budget currently',
  budget_range: 'Under $10k',
  leadership_alignment: 'Supportive but cautious',
  change_readiness: 'Cautious about change',
  risk_tolerance: 'Very low - extremely cautious',
  target_automation: '50-75%',
  decision_speed: 'Weeks to months',
  internal_capability: 'No technical team',
}

const roundTrip = (c: DiagnosticContext): DiagnosticContext => JSON.parse(JSON.stringify(c))
const states = (c: DiagnosticContext, key: 'roomForImprovement' | 'roomForImprovementId') =>
  Object.fromEntries((c[key] ?? []).map((r) => [r.id, r.currentState]))

describe('Room for Improvement copy', () => {
  it('reads as grammatical sentences built from the actual answers', () => {
    const rfi = states(buildDiagnosticContext({ ...BASE }), 'roomForImprovement')
    expect(rfi['rfi-process']).toBe('0-25% of key processes are documented; workflow standardisation: some standardization, mostly ad-hoc.')
    expect(rfi['rfi-data']).toBe('Data centralisation: no centralization; data quality: high quality, clean, and consistent.')
    expect(rfi['rfi-strategy']).toBe('KPI tracking: not currently tracked; objectives are not yet quantified.')
  })

  it('describes the goal clause from the actual quantified_goal answer', () => {
    const c = buildDiagnosticContext({ ...BASE, quantified_goal: 'No, still exploring' })
    expect(states(c, 'roomForImprovement')['rfi-strategy']).toContain('objectives are still being explored')
    expect(states(c, 'roomForImprovementId')['rfi-strategy']).toContain('tujuan masih dalam tahap eksplorasi')
  })

  it('survives the result-page upgrade pass in both locales', () => {
    const built = buildDiagnosticContext({ ...BASE })
    const upgraded = upgradeDiagnosticContext(roundTrip(built))
    expect(states(upgraded, 'roomForImprovement')).toEqual(states(built, 'roomForImprovement'))
    expect(states(upgraded, 'roomForImprovementId')).toEqual(states(built, 'roomForImprovementId'))
  })
})

describe('upgradeDiagnosticContext ROI recompute trigger', () => {
  it('leaves current-methodology figures alone even when the hourly rate is ≤ $15', () => {
    for (const answers of [
      { ...BASE }, // USD small Manufacturing team → $13/hr
      { ...BASE, currency: 'IDR — Indonesian Rupiah (Rp)', budget_range: undefined }, // ≈ US$2/hr
    ]) {
      const built = roundTrip(buildDiagnosticContext(answers))
      expect(built.calculations.assumedHourlyRateUSD).toBeLessThanOrEqual(15)
      // Sentinel: a recompute would overwrite this.
      ;(built.calculations as any).totalAnnualSavingsLocal = 123
      expect(upgradeDiagnosticContext(built).calculations.totalAnnualSavingsLocal).toBe(123)
    }
  })

  it('still recomputes legacy flat-rate contexts', () => {
    const built = roundTrip(buildDiagnosticContext({ ...BASE }))
    const legacy: any = { ...built.calculations, assumedHourlyRateUSD: 8 }
    delete legacy.rateBenchmarkLabel
    const upgraded = upgradeDiagnosticContext({ ...built, calculations: legacy })
    expect(upgraded.calculations.assumedHourlyRateUSD).toBe(13)
  })
})

describe('no automation gap', () => {
  it('suppresses the projection instead of showing a high-confidence −100% range', () => {
    const c = buildDiagnosticContext({ ...BASE, automation_current: '75-100%', target_automation: '50-75%' })
    const k = c.calculations
    expect(k.noAutomationGap).toBe(true)
    expect(k.hasEnoughDataForProjection).toBe(false)
    expect(k.missingInputs).toEqual([])
    expect(k.totalAnnualSavingsLocal).toBeNull()
    expect(k.scenarioHorizonROI).toEqual({ low: null, base: null, high: null })
  })

  it('is false whenever there is a real gap', () => {
    expect(buildDiagnosticContext({ ...BASE }).calculations.noAutomationGap).toBe(false)
  })
})

describe('open "Over 100 hours/week" bucket', () => {
  it('scales with headcount at 2 h/FTE/week, never below 100', () => {
    expect(reconcileManualHoursWithFte('Over 100 hours/week', 100, 300)).toBe(600)
    expect(reconcileManualHoursWithFte('Over 100 hours/week', 100, 10)).toBe(100)
    expect(reconcileManualHoursWithFte('Over 100 hours/week', 100, null)).toBe(100)
  })

  it('leaves bounded buckets as the user answered', () => {
    expect(reconcileManualHoursWithFte('25-50 hours/week', 37, 300)).toBe(37)
  })

  it('flows into the stored quantitative inputs and the ROI', () => {
    const c = buildDiagnosticContext({ ...BASE, manual_hours_weekly: 'Over 100 hours/week', fte_count: 'Over 200 FTEs' })
    expect(c.quantitative.totalManualHoursWeekly).toBe(600)
    expect(c.calculations.hoursReclaimedPerYear).toBe(
      calculateROI(c.quantitative, 'USD', 'Manufacturing').hoursReclaimedPerYear,
    )
  })
})
