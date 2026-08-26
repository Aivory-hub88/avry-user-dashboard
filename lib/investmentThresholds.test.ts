import { describe, it, expect } from 'vitest'
import { getInvestmentThresholds, THRESHOLD_WINDOW_YEARS, TARGET_PAYBACK_MONTHS } from './investmentThresholds'
import { calculateROI } from '@/services/deepDiagnostic'
import type { DiagnosticContext } from '@/types/diagnostic'

const base: DiagnosticContext['quantitative'] = {
  ticketVolumePerDay: null, ahtCurrentMinutes: null, ahtTargetMinutes: null,
  costCurrentPerTicket: null, costTargetPerTicket: null, totalManualHoursWeekly: null,
  fteCountInScope: null, currentAutomationPct: null, targetAutomationPct: null,
  budgetMidpointUSD: null, timelineMonths: null,
}

describe('getInvestmentThresholds', () => {
  it('returns nothing when savings or budget are missing (no table of em-dashes)', () => {
    expect(getInvestmentThresholds(null)).toEqual([])
    expect(getInvestmentThresholds({ totalAnnualSavingsLocal: 1000, assumedBudgetMidpointLocal: null })).toEqual([])
    expect(getInvestmentThresholds({ totalAnnualSavingsLocal: 0, assumedBudgetMidpointLocal: 1000 })).toEqual([])
  })

  it('payback ceiling is savings × 24 months, and its savings floor is the inverse', () => {
    const [payback] = getInvestmentThresholds({ totalAnnualSavingsLocal: 100, assumedBudgetMidpointLocal: 500 })
      .filter(t => t.key === 'payback')
    expect(payback.maxInvestmentLocal).toBeCloseTo(100 * (TARGET_PAYBACK_MONTHS / 12), 6)
    expect(payback.requiredAnnualSavingsLocal).toBeCloseTo(500 / (TARGET_PAYBACK_MONTHS / 12), 6)
  })

  it('an investment exactly at each ceiling makes that test read zero, not negative', () => {
    const S = 100_000
    for (const t of getInvestmentThresholds({ totalAnnualSavingsLocal: S, assumedBudgetMidpointLocal: 1 })) {
      const I = t.maxInvestmentLocal!
      const r = 0.12, d = 0.10, W = THRESHOLD_WINDOW_YEARS
      if (t.key === 'roi') {
        // net cumulative over the window − investment == 0
        expect(S * W - r * I * (W - 1) - I).toBeCloseTo(0, 4)
      } else if (t.key === 'npv') {
        let pv = 0
        for (let y = 1; y <= W; y++) pv += (y === 1 ? S : S - r * I) / Math.pow(1 + d, y)
        expect(pv - I).toBeCloseTo(0, 4)
      } else {
        expect((I / S) * 12).toBeCloseTo(TARGET_PAYBACK_MONTHS, 6)
      }
    }
  })

  it('is ordered strictest ceiling first', () => {
    const ts = getInvestmentThresholds({ totalAnnualSavingsLocal: 100, assumedBudgetMidpointLocal: 900 })
    const ceilings = ts.map(t => t.maxInvestmentLocal!)
    expect([...ceilings].sort((a, b) => a - b)).toEqual(ceilings)
  })

  it('reports overshoot and shortfall only when the test actually fails', () => {
    const tight = getInvestmentThresholds({ totalAnnualSavingsLocal: 100, assumedBudgetMidpointLocal: 1000 })
    expect(tight.every(t => t.clearedToday === false)).toBe(true)
    expect(tight.every(t => (t.investmentOvershootLocal ?? 0) > 0 && (t.savingsShortfallLocal ?? 0) > 0)).toBe(true)

    const healthy = getInvestmentThresholds({ totalAnnualSavingsLocal: 1000, assumedBudgetMidpointLocal: 100 })
    expect(healthy.every(t => t.clearedToday === true)).toBe(true)
    expect(healthy.every(t => t.investmentOvershootLocal === 0 && t.savingsShortfallLocal === 0)).toBe(true)
  })

  it('uses the engine’s own assumptions — a case that clears every threshold has a positive NPV', () => {
    const r = calculateROI({ ...base, totalManualHoursWeekly: 120, fteCountInScope: 40, currentAutomationPct: 15, targetAutomationPct: 90, budgetMidpointUSD: 40000 }, 'USD')
    const ts = getInvestmentThresholds(r as never)
    expect(ts.every(t => t.clearedToday)).toBe(true)
    expect((r as { npvHorizonLocal?: number | null }).npvHorizonLocal!).toBeGreaterThan(0)
  })
})
