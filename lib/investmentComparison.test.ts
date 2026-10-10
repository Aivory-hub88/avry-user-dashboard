import { describe, it, expect, beforeEach } from 'vitest'
import { buildInvestmentComparison, investmentComparisonExplanation } from './investmentComparison'
import { buildDiagnosticContext } from '@/services/deepDiagnostic'
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

describe('buildInvestmentComparison', () => {
  it('reproduces the report tiles in the "your budget" column', () => {
    const { calculations: k } = buildDiagnosticContext(answers as any)
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

  it('recommends 2× annual savings, and every recommended figure is positive', () => {
    const { calculations: k } = buildDiagnosticContext(answers as any)
    const c = buildInvestmentComparison(k as any, getRoiHorizonYears(k))!
    expect(c.recommended.investmentLocal).toBeCloseTo(k.totalAnnualSavingsLocal! * 2, 0)
    expect(c.recommended.paybackMonths).toBeCloseTo(24, 6)
    expect(c.recommended.netAnnualSavingsLocal).toBeGreaterThan(0)
    expect(c.recommended.netPaybackMonths).toBeGreaterThan(24)
    expect(c.recommended.roiPercent).toBeGreaterThan(0)
    expect(c.recommended.npvLocal).toBeGreaterThan(0)
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
    expect(id).toContain('maksimal Rp 120')
    expect(investmentComparisonExplanation(c, fmt, 'en')).toContain('not an error')
  })
})
