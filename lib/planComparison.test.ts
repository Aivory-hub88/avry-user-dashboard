import { describe, it, expect, beforeEach } from 'vitest'
import { buildDiagnosticContext, calculateROI, parseHourlyCostLocal } from '@/services/deepDiagnostic'
import { buildPlanComparison } from './planComparison'
import { TIER_MONTHLY_PRICE_USD } from '@/lib/tiers'

beforeEach(() => {
  ;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})

// Same shape as the reported case: IDR, tech, 6-15 FTEs (so Business is priced), small manual workload.
const ANSWERS = {
  currency: 'IDR — Indonesian Rupiah (Rp)', industry: 'Technology / Software',
  manual_hours_weekly: 'Under 10 hours/week', fte_count: '6-15 FTEs',
  automation_current: '10-25%', target_automation: '50-75%',
  priority_areas: ['Operations and logistics', 'Customer service/support'],
}
const ctx = (extra: Record<string, unknown> = {}) => buildDiagnosticContext({ ...ANSWERS, ...extra } as any)
const fmt = (v: number) => `${v < 0 ? '-' : ''}Rp ${Math.abs(Math.round(v)).toLocaleString('en-US')}`
void parseHourlyCostLocal

describe('buildPlanComparison', () => {
  it('shows Operational and Business, marks the one used, and states who each is for', () => {
    const v = buildPlanComparison(ctx().calculations as any, fmt, 'en')!
    expect(v.rows.map((r) => r.plan)).toEqual(['operational', 'business'])
    expect(v.rows.find((r) => r.plan === 'business')!.used).toBe(true)
    expect(v.rows.find((r) => r.plan === 'operational')!.used).toBe(false)
    expect(v.rows[0].who).toBe('1 person (1 seat)')
    expect(v.rows[1].who).toBe('A team of up to 5 people (5 seats)')
    expect(v.rows[1].includes).toBe('6,500 Intelligence Credits per month')
    expect(v.rows[1].price).toMatch(/\/month \(US\$99\)$/)
    expect(v.heading).toBe('The Aivory plan: what it is and who it is for')
  })

  it('the used plan reproduces the stored figures exactly', () => {
    const calc: any = ctx().calculations
    const v = buildPlanComparison(calc, fmt, 'en')!
    const used = v.rows.find((r) => r.used)!
    expect(used.net).toBe(fmt(calc.netAnnualSavingsLocal))
    expect(used.investment).toBe(fmt(calc.requiredInvestment.initialUSD * calc.fxRateUsed))
  })

  it('the other plan equals a full re-run priced on that plan (no drift, no hand-waving)', () => {
    const c = ctx()
    const calc: any = c.calculations
    const ri = calc.requiredInvestment
    const op = TIER_MONTHLY_PRICE_USD.operational
    const alt = { ...ri, plan: 'operational', planMonthlyUSD: op, planPriceIsFloor: false,
      initialUSD: ri.packageUSD + ri.setupUSD + op * ri.planMonthsYear1, annualRecurringUSD: op * 12 }
    const rerun: any = calculateROI(c.quantitative, 'IDR', ANSWERS.industry, undefined, alt)
    const v = buildPlanComparison(calc, fmt, 'en')!
    const row = v.rows.find((r) => r.plan === 'operational')!
    // The card shifts the stored result by the plan price. Net savings and year-1
    // investment are window-independent, so they must equal the re-run exactly.
    // (NPV is deliberately not on the card: the adaptive ROI window moves from 3 to 5
    // years once the cheaper plan breaks even, so NPVs are not comparable across plans.)
    expect(row.net).toBe(fmt(rerun.netAnnualSavingsLocal))
    expect(row.investment).toBe(fmt(rerun.assumedBudgetMidpointLocal))
    expect(rerun.netBreakEvenYears).not.toBeNull()
    expect(row.payback).toBe(`${rerun.netBreakEvenYears.toFixed(1)} years`)
    expect(row.paybackTone).toBe('good')
  })

  it('makes the dependence visible: the cheaper plan can flip the sign', () => {
    const calc: any = ctx().calculations
    const v = buildPlanComparison(calc, fmt, 'en')!
    const biz = v.rows.find((r) => r.plan === 'business')!
    const op = v.rows.find((r) => r.plan === 'operational')!
    expect(biz.netTone).toBe('bad')
    expect(op.netTone).toBe('good')
    expect(biz.payback).toBe('Not reached')
    expect(biz.paybackTone).toBe('bad')
  })

  it('says the plan is assumed when team size is unknown, and explains the rule otherwise', () => {
    const unknown = buildPlanComparison(ctx({ fte_count: 'Not sure' }).calculations as any, fmt, 'en')!
    expect(unknown.caveat).toMatch(/team size was not given/)
    expect(unknown.rows.find((r) => r.used)!.plan).toBe('operational')
    const stated = buildPlanComparison(ctx().calculations as any, fmt, 'en')!
    expect(stated.caveat).toMatch(/1–5 Operational, 6–200 Business, over 200 Enterprise/)
    expect(stated.caveat).toMatch(/how many people use Aivory/)
  })

  it('adds Enterprise only when it is the plan used, and is localized', () => {
    const big = buildPlanComparison(ctx({ fte_count: 'Over 200 FTEs' }).calculations as any, fmt, 'en')!
    expect(big.rows.map((r) => r.plan)).toEqual(['operational', 'business', 'enterprise'])
    expect(big.rows[2].price).toMatch(/Priced by sales/)
    const id = buildPlanComparison(ctx().calculations as any, fmt, 'id')!
    expect(id.heading).toBe('Plan Aivory: apa itu dan untuk siapa')
    expect(id.rows[1].who).toBe('Tim hingga 5 orang (5 kursi)')
    expect(id.labels.used).toBe('Dipakai di laporan ini')
  })

  it('is null on the old whole-budget basis', () => {
    expect(buildPlanComparison({ investmentBasis: 'stated_budget' }, fmt, 'en')).toBeNull()
    expect(buildPlanComparison(null, fmt, 'en')).toBeNull()
  })
})
