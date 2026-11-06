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
  it('solo -> Operational; a team -> Business (Enterprise above 200, Business price as a floor); never Operational for a team', () => {
    expect(aivoryPlanForTeam(null, 'Solo / Freelancer (1 person)')).toMatchObject({ plan: 'operational', planMonthlyUSD: 20, planPriceIsFloor: false, planAssumed: false })
    expect(aivoryPlanForTeam(3, 'Micro (2–10 employees)')).toMatchObject({ plan: 'business', planMonthlyUSD: 99, planAssumed: false })
    expect(aivoryPlanForTeam(33)).toMatchObject({ plan: 'business', planMonthlyUSD: 99 })
    expect(aivoryPlanForTeam(300)).toMatchObject({ plan: 'enterprise', planMonthlyUSD: 99, planPriceIsFloor: true })
  })
})

describe('unknown team size (FTE question skipped or "Not sure")', () => {
  it('assumes the entry plan instead of the dearest one, and flags it', () => {
    expect(aivoryPlanForTeam(null)).toMatchObject({ plan: 'operational', planMonthlyUSD: 20, planAssumed: true })
    // but a known team is never an assumption, even when the employee count is unknown
    expect(aivoryPlanForTeam(null, 'Small (11–50 employees)')).toMatchObject({ plan: 'business', planAssumed: false })
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

  it('tells the reader the recommended plan is an assumption (the plan is no longer a line in the investment)', () => {
    const SMALL = { ...LOGISTICS, manual_hours_weekly: 'Under 10 hours/week', fte_count: 'Not sure' }
    const calc: any = buildDiagnosticContext(SMALL as any).calculations
    const en = buildRequiredInvestmentView(calc, (v) => String(Math.round(v)), 'en')!
    expect(en.rows.some((r) => /Aivory|Business plan|Operational plan|Enterprise plan/.test(r.label))).toBe(false)
    expect(en.planNote).toMatch(/We recommend the Operational plan: your team size is not known, so the entry plan is assumed/)
    const id = buildRequiredInvestmentView(calc, (v) => String(Math.round(v)), 'id')!
    expect(id.planNote).toMatch(/Kami merekomendasikan plan Operational: ukuran tim tidak diketahui/)
  })
})

describe('estimateRequiredInvestment', () => {
  const pick = (name: string, priceBasis: string, priceUSD: number) =>
    ({ name, category: { en: 'Cat', id: 'Kat' }, priceBasis, priceUSD, regions: ['global'], reason: { en: '', id: '' }, vendorUrl: '', priceCheckedAt: '2026-08-27', matchedSignal: 'x' }) as any
  const prepOpp = (title: string, complexity: RankedOpportunity['complexity'], dataReadiness: string, training = false) =>
    ({ title, complexity, dataReadiness, ...(training ? { trainingTracks: [] } : {}) }) as unknown as RankedOpportunity

  it('= your own setup effort by complexity; Aivory package and plan are NOT in it; training is not set up', () => {
    const r = estimateRequiredInvestment([opp('low'), opp('medium'), opp('high'), opp('low', true)], 33, 10)
    expect(r.costModel).toBe('transformation')
    expect(r.setupOpportunities).toBe(3)
    expect(r.setupHours).toBe(20 + 60 + 160)
    expect(r.setupUSD).toBe(2400)
    expect(r.initialUSD).toBe(2400) // no package, no plan months
    expect(r.annualRecurringUSD).toBe(0)
    // Aivory stays on the object as ONE delivery option, with its own numbers
    expect(r.packageUSD).toBe(299)
    expect(r.planMonthsYear1).toBe(11)
    expect(r.plan).toBe('business')
    expect(r.planMonthlyUSD).toBe(99)
  })

  it('prices only software whose list price covers a team (or is free); everything else is listed as not priced, never guessed', () => {
    const r = estimateRequiredInvestment([opp('low')], 10, 10, undefined, [
      pick('Flat tool', 'flat', 20),
      pick('Self hosted', 'self_host', 0),
      pick('Free CRM', 'per_user', 0),
      pick('Seat tool', 'per_user', 17),
      pick('Fee tool', 'transaction_fee', 0),
      pick('Quote tool', 'quote', 0),
    ])
    const annual = Object.fromEntries(r.softwareLines!.map((l) => [l.name, l.annualUSD]))
    expect(annual).toEqual({ 'Flat tool': 240, 'Self hosted': 0, 'Free CRM': 0, 'Seat tool': null, 'Fee tool': null, 'Quote tool': null })
    expect(r.softwareAnnualUSD).toBe(240)
    expect(r.initialUSD).toBe(r.setupUSD + 240) // year 1 = setup + 12 months of the priced software
    expect(r.annualRecurringUSD).toBe(240)
    expect(r.unpriced!.filter((i) => i.kind === 'software').map((i) => i.title)).toEqual(['Seat tool', 'Fee tool', 'Quote tool'])
  })

  it('lists training and data preparation as not priced (the catalog has no price for them)', () => {
    const r = estimateRequiredInvestment([
      prepOpp('Order intake', 'low', 'ready'),
      prepOpp('Reporting', 'medium', 'needs_prep'),
      prepOpp('Ticket triage', 'medium', 'not_ready'),
      prepOpp('Team training', 'low', 'ready', true),
    ], 10, 10)
    expect(r.unpriced).toEqual([
      { kind: 'training', title: 'Team training' },
      { kind: 'data_prep', title: 'Reporting' },
      { kind: 'data_prep', title: 'Ticket triage' },
    ])
    expect(r.setupOpportunities).toBe(3) // training is not an automation to set up
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
    expect(k.annualOngoingCostUSD).toBe(0) // the plan is a recommendation, not a running cost in the case
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
    expect(labels[0]).toContain('Setup & integrasi oleh tim Anda')
    expect(labels.some((l) => /Complete Transformation Package|Aivory/.test(l))).toBe(false)
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
  it('hands the PDF a one-paragraph plan recommendation (the full card is covered in planComparison.test.ts)', () => {
    const k: any = buildDiagnosticContext(LOGISTICS as any).calculations // 16-50 FTE -> Business
    const en = buildRequiredInvestmentView(k, fmt, 'en')!.planNote!
    expect(en).toMatch(/We recommend the Business plan: your team is more than one person/)
    expect(en).toMatch(/monthly subscription that runs your automations after the one-time package/)
    const id = buildRequiredInvestmentView(k, fmt, 'id')!.planNote!
    expect(id).toMatch(/Kami merekomendasikan plan Business/)
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
