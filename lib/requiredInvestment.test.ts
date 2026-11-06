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
    expect(aivoryPlanForTeam(3)).toMatchObject({ planAssumed: false })
    expect(aivoryPlanForTeam(300)).toMatchObject({ plan: 'enterprise', planMonthlyUSD: 99, planPriceIsFloor: true })
  })
})

describe('unknown team size (FTE question skipped or "Not sure")', () => {
  it('assumes the entry plan instead of the dearest one, and flags it', () => {
    expect(aivoryPlanForTeam(null)).toMatchObject({ plan: 'operational', planMonthlyUSD: 20, planAssumed: true })
  })

  it('does not turn a small scope into a net loss just because team size is unknown', () => {
    // ~4 recoverable h/week at IDR rates: Business ($99/mo) would exceed the savings, Operational does not.
    const SMALL = { ...LOGISTICS, manual_hours_weekly: 'Under 10 hours/week', fte_count: 'Not sure' }
    const c: any = buildDiagnosticContext(SMALL as any).calculations
    expect(c.requiredInvestment.plan).toBe('operational')
    expect(c.requiredInvestment.planAssumed).toBe(true)
    expect(c.netAnnualSavingsLocal).toBeGreaterThan(0)
    expect(c.netPaybackMonths).not.toBeNull()
  })

  it('still prices a stated 6-200 FTE team on Business (not an assumption)', () => {
    const c: any = buildDiagnosticContext({ ...LOGISTICS, fte_count: '16-50 FTEs' } as any).calculations
    expect(c.requiredInvestment.plan).toBe('business')
    expect(c.requiredInvestment.planAssumed).toBe(false)
  })

  it('tells the reader the plan is an assumption', () => {
    const SMALL = { ...LOGISTICS, manual_hours_weekly: 'Under 10 hours/week', fte_count: 'Not sure' }
    const calc: any = buildDiagnosticContext(SMALL as any).calculations
    const en = buildRequiredInvestmentView(calc, (v) => String(Math.round(v)), 'en')!
    expect(en.rows.some((r) => /assumed, team size not given/.test(r.label))).toBe(true)
    expect(en.footnote).toMatch(/Operational plan is assumed/)
    const id = buildRequiredInvestmentView(calc, (v) => String(Math.round(v)), 'id')!
    expect(id.footnote).toMatch(/plan Operasional diasumsikan/)
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
  it('shows the breakdown and the budget, in Indonesian, without a "left over" line', () => {
    const k: any = buildDiagnosticContext(LOGISTICS as any).calculations
    const v = buildRequiredInvestmentView(k, fmt, 'id')!
    const labels = v.rows.map((r) => r.label)
    expect(labels[0]).toContain('Complete Transformation Package')
    expect(labels).toContain('Investasi yang dibutuhkan — tahun pertama')
    expect(labels).toContain('Anggaran yang Anda siapkan')
    // a positive remainder next to a possibly net-negative case was misleading, so it is not a row
    expect(labels.some((l) => /sisa|ruang anggaran|left over|headroom/i.test(l))).toBe(false)
    expect(v.explanation).toContain('batas atas, bukan biaya proyek')
    expect(v.explanation).toContain('belum berarti cakupan ini balik modal')
    expect(v.footnote).toContain('rendah 20, sedang 60, tinggi 160')
  })
  it('never prints a left-over / headroom figure in English either', () => {
    const k: any = buildDiagnosticContext(LOGISTICS as any).calculations
    const v = buildRequiredInvestmentView(k, fmt, 'en')!
    expect(v.rows.some((r) => /left over|headroom/i.test(r.label))).toBe(false)
    expect(v.explanation).toMatch(/ceiling, not the cost of the project/)
    expect(v.explanation).not.toMatch(/unspent|leaving/)
  })
  it('explains what the Aivory plan is: price, seats, credits, why this plan', () => {
    const k: any = buildDiagnosticContext(LOGISTICS as any).calculations // 16-50 FTE -> Business
    const en = buildRequiredInvestmentView(k, fmt, 'en')!.planNote!
    expect(en).toMatch(/monthly subscription that runs your automations after the one-time package/)
    expect(en).toMatch(/The Business plan \(.*\/month \(US\$99\)\) includes up to 5 team seats and 6,500 Intelligence Credits per month/)
    expect(en).toMatch(/only recurring cost counted in this report/)
    expect(en).toMatch(/year 1 carries 11 months, and from year 2 it is 12 months/)
    expect(en).toMatch(/Business plan fits 6–200 employees in scope/)
    const id = buildRequiredInvestmentView(k, fmt, 'id')!.planNote!
    expect(id).toMatch(/langganan bulanan yang menjalankan otomasi Anda/)
    expect(id).toMatch(/Plan Business sesuai untuk 6–200 karyawan/)
  })
  it('says the plan is an assumption when team size is unknown, and why Enterprise is a floor', () => {
    const unknown: any = buildDiagnosticContext({ ...LOGISTICS, fte_count: 'Not sure' } as any).calculations
    const a = buildRequiredInvestmentView(unknown, fmt, 'en')!.planNote!
    expect(a).toMatch(/The Operational plan/)
    expect(a).toMatch(/team size was not given, so the entry plan is assumed/)
    const big: any = buildDiagnosticContext({ ...LOGISTICS, fte_count: 'Over 200 FTEs' } as any).calculations
    const e = buildRequiredInvestmentView(big, fmt, 'en')!.planNote!
    expect(e).toMatch(/Enterprise is priced by sales, so the Business price is used as a floor/)
    expect(e).not.toMatch(/team seats/)
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
