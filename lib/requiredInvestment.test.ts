import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildDiagnosticContext,
  calculateROI,
  estimateRequiredInvestment,
  aivoryPlanForTeam,
  recomputeROIAtEfficiency,
} from '@/services/deepDiagnostic'
import { buildRequiredInvestmentView } from './requiredInvestmentView'
import type { RankedOpportunity } from '@/types/diagnostic'

beforeEach(() => {
  ;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})

const opp = (complexity: RankedOpportunity['complexity'], training = false) =>
  ({ complexity, ...(training ? { trainingTracks: [] } : {}) }) as unknown as RankedOpportunity

// The screenshot case: IDR logistics, 16–50 FTE, dollar budget band.
const LOGISTICS = {
  currency: 'IDR — Indonesian Rupiah (Rp)', industry: 'Logistics / Supply Chain',
  manual_hours_weekly: '50-100 hours/week', fte_count: '16-50 FTEs',
  automation_current: '10-25%', target_automation: '50-75%', budget_range: '$50K - $100K',
  priority_areas: ['Operations and logistics', 'Finance and accounting', 'Customer service/support'],
}

describe('aivoryPlanForTeam', () => {
  it('picks the plan by team size; enterprise uses Business as a floor', () => {
    expect(aivoryPlanForTeam(3)).toMatchObject({ plan: 'operational', planMonthlyUSD: 20, planPriceIsFloor: false })
    expect(aivoryPlanForTeam(33)).toMatchObject({ plan: 'business', planMonthlyUSD: 99 })
    expect(aivoryPlanForTeam(null)).toMatchObject({ plan: 'business' })
    expect(aivoryPlanForTeam(300)).toMatchObject({ plan: 'enterprise', planMonthlyUSD: 99, planPriceIsFloor: true })
  })
})

describe('estimateRequiredInvestment', () => {
  it('= package + setup hours by complexity + 11 plan months; training is not set up', () => {
    const r = estimateRequiredInvestment([opp('low'), opp('medium'), opp('high'), opp('low', true)], 33, 10)
    expect(r.setupOpportunities).toBe(3)
    expect(r.setupHours).toBe(20 + 60 + 160)
    expect(r.setupUSD).toBe(2400)
    expect(r.planMonthsYear1).toBe(11)
    expect(r.initialUSD).toBe(299 + 2400 + 99 * 11)
    expect(r.annualRecurringUSD).toBe(99 * 12)
  })
})

describe('report on the required basis', () => {
  it('appraises the required investment, keeps the stated budget separately, and turns positive', () => {
    const c = buildDiagnosticContext(LOGISTICS as any)
    const k: any = c.calculations
    expect(k.investmentBasis).toBe('required')
    expect(k.requiredInvestment.plan).toBe('business')
    expect(k.assumedBudgetMidpointUSD).toBeCloseTo(k.requiredInvestment.initialUSD, 6)
    expect(k.statedBudgetUSD).toBe(75_000)
    expect(k.annualOngoingCostUSD).toBe(99 * 12)
    expect(k.netAnnualSavingsLocal).toBeGreaterThan(0)
    expect(k.horizonROIPercent).toBeGreaterThan(0)
    expect(k.npvHorizonUSD).toBeGreaterThan(0)
    expect(k.netPaybackMonths).toBeLessThan(24)
  })

  it('no longer needs a budget to project', () => {
    const { budget_range: _omit, ...noBudget } = LOGISTICS
    const k: any = buildDiagnosticContext(noBudget as any).calculations
    expect(k.missingInputs).not.toContain('budget')
    expect(k.hasEnoughDataForProjection).toBe(true)
    expect(k.statedBudgetUSD).toBeNull()
  })

  it('keeps the slider/tornado on the same investment as the tiles', () => {
    const c = buildDiagnosticContext(LOGISTICS as any)
    const again = recomputeROIAtEfficiency(c, 0.75)!
    expect(again.horizonROIPercent).toBeCloseTo(c.calculations.horizonROIPercent!, 6)
    expect((again as any).investmentBasis).toBe('required')
  })

  it('leaves old contexts on the whole-budget basis', () => {
    const k: any = calculateROI(buildDiagnosticContext(LOGISTICS as any).quantitative, 'IDR', 'Logistics / Supply Chain')
    expect(k.investmentBasis).toBe('stated_budget')
    expect(k.assumedBudgetMidpointUSD).toBe(75_000)
    expect(k.horizonROIPercent).toBeLessThan(0)
  })
})

describe('buildRequiredInvestmentView', () => {
  const fmt = (v: number) => `Rp ${Math.round(v).toLocaleString('id-ID')}`
  it('shows the breakdown, the budget and what is left, in Indonesian', () => {
    const k: any = buildDiagnosticContext(LOGISTICS as any).calculations
    const v = buildRequiredInvestmentView(k, fmt, 'id')!
    const labels = v.rows.map((r) => r.label)
    expect(labels[0]).toContain('Complete Transformation Package')
    expect(labels).toContain('Investasi yang dibutuhkan — tahun pertama')
    expect(labels).toContain('Sisa anggaran')
    expect(v.explanation).toContain('bukan dari seluruh anggaran')
    expect(v.footnote).toContain('rendah 20, sedang 60, tinggi 160')
  })
  it('flags a shortfall when the budget is smaller than the requirement', () => {
    const k: any = { ...buildDiagnosticContext(LOGISTICS as any).calculations }
    k.statedBudgetLocal = 1000
    const v = buildRequiredInvestmentView(k, fmt, 'en')!
    expect(v.rows.at(-1)).toMatchObject({ label: 'Budget shortfall', tone: 'bad' })
  })
  it('is null on the old whole-budget basis', () => {
    expect(buildRequiredInvestmentView({ investmentBasis: 'stated_budget' }, fmt, 'en')).toBeNull()
  })
})
