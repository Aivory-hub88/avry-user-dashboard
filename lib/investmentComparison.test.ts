import { describe, it, expect, beforeEach } from 'vitest'
import { buildInvestmentComparison, investmentComparisonExplanation } from './investmentComparison'
import { buildDiagnosticContext, calculateROI } from '@/services/deepDiagnostic'
import { getRoiHorizonYears } from './roiHorizon'

beforeEach(() => {
  ;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})

// The screenshot case: IDR logistics, dollar budget band, ~Rp 59.7 juta/yr savings.
const answers = {
  currency: 'IDR — Indonesian Rupiah (Rp)', industry: 'Logistics / Supply Chain',
  manual_hours_weekly: '50-100 hours/week', fte_count: '16-50 FTEs',
  automation_current: '10-25%', target_automation: '50-75%', budget_range: '$50K - $100K',
}

// The ceiling comparison only applies to reports appraised on the whole stated
// budget (contexts stored before the required-investment basis) — rebuild
// that basis explicitly.
const wholeBudgetCalc = () =>
  calculateROI(buildDiagnosticContext(answers as any).quantitative, 'IDR', 'Logistics / Supply Chain')

describe('buildInvestmentComparison', () => {
  it('reproduces the report tiles in the "your budget" column', () => {
    const k = wholeBudgetCalc()
    const H = getRoiHorizonYears(k)
    const c = buildInvestmentComparison(k as any, H)!
    expect(c).not.toBeNull()
    expect(c.stated.investmentLocal).toBeCloseTo(k.assumedBudgetMidpointLocal!, 0)
    expect(c.stated.roiPercent).toBeCloseTo(k.horizonROIPercent!, 6)
    expect(c.stated.netAnnualSavingsLocal / (k as any).netAnnualSavingsLocal).toBeCloseTo(1, 4)
    expect(c.stated.npvLocal / (k as any).npvHorizonLocal).toBeCloseTo(1, 3)
    expect(c.stated.netPaybackMonths).toBeNull()
    expect(c.stated.roiPercent).toBeLessThan(0)
  })

  it('sets the ceiling at 2× annual savings, and every ceiling figure is positive', () => {
    const k = wholeBudgetCalc()
    const c = buildInvestmentComparison(k as any, getRoiHorizonYears(k))!
    expect(c.ceiling.investmentLocal).toBeCloseTo(k.totalAnnualSavingsLocal! * 2, 0)
    expect(c.ceiling.paybackMonths).toBeCloseTo(24, 6)
    expect(c.ceiling.netAnnualSavingsLocal).toBeGreaterThan(0)
    expect(c.ceiling.netPaybackMonths).toBeGreaterThan(24)
    expect(c.ceiling.roiPercent).toBeGreaterThan(0)
    expect(c.ceiling.npvLocal).toBeGreaterThan(0)
  })

  it('is null for new reports on the required-investment basis (healthy case)', () => {
    const { calculations } = buildDiagnosticContext(answers as any)
    expect(buildInvestmentComparison(calculations as any, getRoiHorizonYears(calculations))).toBeNull()
  })

  it('is null when the stated budget already pays back within 24 months, or inputs are missing', () => {
    const healthy = { totalAnnualSavingsLocal: 100, assumedBudgetMidpointLocal: 150, hasEnoughDataForProjection: true }
    expect(buildInvestmentComparison(healthy, 3)).toBeNull()
    expect(buildInvestmentComparison({ totalAnnualSavingsLocal: 100, assumedBudgetMidpointLocal: null }, 3)).toBeNull()
    expect(buildInvestmentComparison({ totalAnnualSavingsLocal: 100, assumedBudgetMidpointLocal: 500, hasEnoughDataForProjection: false }, 3)).toBeNull()
  })

  it('explains the negative case in plain language, both locales', () => {
    const c = buildInvestmentComparison({ totalAnnualSavingsLocal: 60, assumedBudgetMidpointLocal: 1340, hasEnoughDataForProjection: true }, 7)!
    const fmt = (v: number) => `Rp ${Math.round(v)}`
    const id = investmentComparisonExplanation(c, fmt, 'id')
    expect(id).toContain('22,3× penghematan tahunan')
    expect(id).toContain('biaya berjalannya (Rp 161/tahun) bahkan lebih besar')
    expect(id).toContain('batas investasi')
    expect(id).toContain('bukan perkiraan biaya solusi')
    expect(id).not.toContain('direkomendasikan')
    expect(investmentComparisonExplanation(c, fmt, 'en')).toContain('not an error')
  })
})
