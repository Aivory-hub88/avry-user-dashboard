import { describe, it, expect, beforeEach } from 'vitest'
import { buildDiagnosticContext, calculateROI, upgradeDiagnosticContext } from '@/services/deepDiagnostic'
import { buildPlanComparison } from './planComparison'
import { buildRequiredInvestmentView } from './requiredInvestmentView'
import { hasRunningCost } from './runningCost'

beforeEach(() => {
  ;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})

// The reported case: IDR, 6-15 FTEs (Business by the team-size rule), small workload, own hourly cost.
const ANSWERS = {
  currency: 'IDR — Indonesian Rupiah (Rp)', industry: 'Technology / Software',
  manual_hours_weekly: 'Under 10 hours/week', fte_count: '6-15 FTEs', hourly_cost: 75000,
  automation_current: '10-25%', target_automation: '50-75%',
  priority_areas: ['Operations and logistics', 'Customer service/support'],
}
const fmt = (v: number) => `${v < 0 ? '-' : ''}Rp ${Math.abs(Math.round(v)).toLocaleString('en-US')}`

/** An old stored requiredInvestment: no costModel, no software lines (what every report saved before the transformation model has). */
const oldRI = (ri: any, plan: boolean) => ({
  ...ri,
  costModel: undefined,
  softwareLines: undefined,
  softwareAnnualUSD: undefined,
  unpriced: undefined,
  initialUSD: ri.packageUSD + ri.setupUSD + (plan ? ri.planMonthlyUSD * ri.planMonthsYear1 : 0),
  annualRecurringUSD: plan ? ri.planMonthlyUSD * 12 : 0,
})

/** What a report saved BEFORE 2026-11-06 looks like: the Aivory plan inside the figures (plan = true),
 *  or, from 2026-11-06 until the transformation model, only Aivory's package + setup (plan = false). */
function legacyReport(plan = true) {
  const ctx: any = buildDiagnosticContext(ANSWERS as any)
  const legacyRI = oldRI(ctx.calculations.requiredInvestment, plan)
  const calculations = calculateROI(ctx.quantitative, 'IDR', ctx.qualitative?.industry, undefined, legacyRI)
  return { fresh: ctx, legacy: { ...ctx, calculations } as any }
}

describe('opening a report saved with the plan inside its figures', () => {
  it('the saved report really is the broken one: running cost, negative net savings', () => {
    const { legacy } = legacyReport()
    expect(hasRunningCost(legacy.calculations)).toBe(true)
    expect(legacy.calculations.netAnnualSavingsLocal).toBeLessThan(0)
    expect(legacy.calculations.npvHorizonLocal).toBeLessThan(0)
  })

  it('is re-priced on the transformation basis: your own setup + recommended software; no Aivory package or plan in the figures', () => {
    const { legacy } = legacyReport()
    const up: any = upgradeDiagnosticContext(legacy)
    const c = up.calculations
    const r = c.requiredInvestment
    expect(r.costModel).toBe('transformation')
    expect(r.initialUSD).toBe(r.setupUSD + r.softwareAnnualUSD)
    expect(r.annualRecurringUSD).toBe(r.softwareAnnualUSD)
    expect(c.netAnnualSavingsUSD).toBeCloseTo(c.totalAnnualSavingsUSD - r.softwareAnnualUSD, 6)
    expect(c.netAnnualSavingsLocal).toBeGreaterThan(0)
    expect(c.npvHorizonLocal).toBeGreaterThan(0) // no longer -Rp 30.9M
  })

  it('a report priced on Aivory package + setup (the previous model) is re-priced too', () => {
    const { legacy } = legacyReport(false)
    expect(legacy.calculations.requiredInvestment.costModel).toBeUndefined()
    const r = (upgradeDiagnosticContext(legacy) as any).calculations.requiredInvestment
    expect(r.costModel).toBe('transformation')
    expect(r.initialUSD).toBe(r.setupUSD + r.softwareAnnualUSD)
  })

  it('keeps the user-stated hourly cost and the scope; only the plan leaves the figures', () => {
    const { legacy } = legacyReport()
    const c = (upgradeDiagnosticContext(legacy) as any).calculations
    expect(c.hourlyRateSource).toBe('user')
    expect(c.assumedHourlyRateLocal).toBeCloseTo(75000, 0)
    expect(c.requiredInvestment.setupHours).toBe(legacy.calculations.requiredInvestment.setupHours)
    expect(c.totalAnnualSavingsLocal).toBeCloseTo(legacy.calculations.totalAnnualSavingsLocal, 0)
  })

  it('then the page is consistent: the plan is only a recommendation, never "already counted"', () => {
    const { legacy } = legacyReport()
    const c = (upgradeDiagnosticContext(legacy) as any).calculations
    const card = buildPlanComparison(c, fmt, 'en')!
    expect(card.caveat).toMatch(/not part of the Financial Case figures/)
    expect(card.caveat).not.toMatch(/already counted/)
    const labels = buildRequiredInvestmentView(c, fmt, 'en')!.rows.map((r) => r.label)
    expect(labels.some((l) => /Aivory|Business plan|Operational plan|Enterprise plan/.test(l))).toBe(false)
  })

  it('is idempotent and leaves an already-new report untouched', () => {
    const { legacy, fresh } = legacyReport()
    const once: any = upgradeDiagnosticContext(legacy)
    const twice: any = upgradeDiagnosticContext(once)
    expect(twice.calculations).toBe(once.calculations)
    expect(upgradeDiagnosticContext(fresh).calculations).toBe(fresh.calculations)
  })
})

describe('the plan card never shows value as a negative number', () => {
  it('states the value once, and compares the plan cost with it', () => {
    const c = (upgradeDiagnosticContext(legacyReport().legacy) as any).calculations
    const card = buildPlanComparison(c, fmt, 'en')!
    expect(card.valueLine).toMatch(/^Value this scope creates: Rp [\d,]+ per year/)
    // Business (cost per year known) is compared with the value; Enterprise is sales-priced, so it has no share
    const biz = card.rows.find((r) => r.plan === 'business')!
    expect(biz.share).toBeTruthy()
    expect(biz.share).not.toMatch(/%/)
    expect(card.rows.find((r) => r.plan === 'enterprise')!.share).toBeNull()
    expect(JSON.stringify(card)).not.toMatch(/value left|-Rp/i)
    const id = buildPlanComparison(c, fmt, 'id')!
    expect(id.labels.share).toBe('Kenapa layak')
    expect(id.valueLine).toMatch(/^Nilai yang dihasilkan cakupan ini:/)
  })
})
