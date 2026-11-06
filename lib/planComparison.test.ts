import { describe, it, expect, beforeEach } from 'vitest'
import { buildDiagnosticContext } from '@/services/deepDiagnostic'
import { buildPlanComparison } from './planComparison'
import { buildRequiredInvestmentView } from './requiredInvestmentView'
import { hasRunningCost } from './runningCost'
import { buildFinancialTermsNote } from './readinessNarrative'

beforeEach(() => {
  ;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})

// Same shape as the reported case: IDR, tech, 6-15 FTEs, small manual workload.
const ANSWERS = {
  currency: 'IDR — Indonesian Rupiah (Rp)', industry: 'Technology / Software',
  manual_hours_weekly: 'Under 10 hours/week', fte_count: '6-15 FTEs',
  automation_current: '10-25%', target_automation: '50-75%',
  priority_areas: ['Operations and logistics', 'Customer service/support'],
}
const calcOf = (extra: Record<string, unknown> = {}) => buildDiagnosticContext({ ...ANSWERS, ...extra } as any).calculations as any
// A scope big enough that the Business plan (Rp ~18.5M/yr at test FX) is a small share of the value created.
const BIG = { manual_hours_weekly: '50-100 hours/week', industry: 'Logistics / Supply Chain' }
const fmt = (v: number) => `${v < 0 ? '-' : ''}Rp ${Math.abs(Math.round(v)).toLocaleString('en-US')}`

describe('the Aivory plan is a recommendation, not part of the Financial Case', () => {
  it('investment is package + setup only, with no running cost', () => {
    const c = calcOf()
    const r = c.requiredInvestment
    expect(r.initialUSD).toBe(r.packageUSD + r.setupUSD)
    expect(r.annualRecurringUSD).toBe(0)
    expect(c.annualOngoingCostUSD).toBe(0)
    expect(c.ongoingCostRate).toBe(0)
    expect(hasRunningCost(c)).toBe(false)
  })

  it('one basis everywhere: net savings equal the gross savings, ROI equals net ROI, payback equals net payback', () => {
    const c = calcOf()
    expect(c.netAnnualSavingsUSD).toBe(c.totalAnnualSavingsUSD)
    expect(c.netHorizonROIPercent).toBe(Math.max(-100, Math.min(Math.round(c.horizonROIPercent), 999)))
    expect(c.netPaybackMonths).toBeCloseTo(c.paybackMonths, 0)
  })

  it('the case no longer flips negative because of the plan: the reported 6-15 FTE case has positive net savings', () => {
    const c = calcOf()
    expect(c.requiredInvestment.plan).toBe('business')
    expect(c.netAnnualSavingsLocal).toBeGreaterThan(0)
    expect(c.npvHorizonLocal).toBeDefined()
  })

  it('stored older reports (plan inside the figures) are still recognised as having a running cost', () => {
    expect(hasRunningCost({ annualOngoingCostUSD: 1188 })).toBe(true)
    expect(hasRunningCost({ annualOngoingCostLocal: 21_510_762 })).toBe(true)
    expect(hasRunningCost({ annualOngoingCostUSD: 0 })).toBe(false)
    expect(hasRunningCost(null)).toBe(false)
  })
})

describe('buildPlanComparison (the recommendation card)', () => {
  it('recommends the plan, states who each is for, and marks the recommended one', () => {
    const v = buildPlanComparison(calcOf(BIG), fmt, 'en')!
    expect(v.heading).toBe('Recommended Aivory plan')
    expect(v.recommendation).toBe('We recommend the Business plan: it fits 6–200 employees in scope.')
    expect(v.rows.map((r) => r.plan)).toEqual(['operational', 'business'])
    expect(v.rows.find((r) => r.plan === 'business')!.recommended).toBe(true)
    expect(v.rows[0].who).toBe('1 person (1 seat)')
    expect(v.rows[1].who).toBe('A team of up to 5 people (5 seats)')
    expect(v.rows[1].includes).toBe('6,500 Intelligence Credits per month')
    expect(v.rows[1].price).toMatch(/\/month \(US\$99\)$/)
  })

  it('shows what the plan costs per year and what is left of the yearly value, per plan', () => {
    const c = calcOf(BIG)
    const v = buildPlanComparison(c, fmt, 'en')!
    const fx = c.fxRateUsed
    const op = v.rows.find((r) => r.plan === 'operational')!
    const biz = v.rows.find((r) => r.plan === 'business')!
    expect(op.yearly).toBe(`${fmt(20 * 12 * fx)}/year`)
    expect(biz.yearly).toBe(`${fmt(99 * 12 * fx)}/year`)
    // value stays a positive number and the plan is the cost compared against it
    expect(op.share).toBe(`${Math.round((20 * 12 * fx / c.totalAnnualSavingsLocal) * 100)}% of the yearly value`)
    expect(biz.share).toBe(`${Math.round((99 * 12 * fx / c.totalAnnualSavingsLocal) * 100)}% of the yearly value`)
    expect(v.valueLine).toBe(`Value this scope creates: ${fmt(c.totalAnnualSavingsLocal)} per year (from the Financial Case).`)
    expect(JSON.stringify(v)).not.toMatch(/value left/i)
    // the dependence is visible: the cheaper plan leaves more of the value
    expect(op.shareTone).toBe('good')
  })

  it('steps down to Operational when the team-size match would cost more per year than the scope creates (the reported case)', () => {
    const c = calcOf() // 6-15 FTEs, small workload: value ~Rp 9M/yr vs Business ~Rp 18.5M/yr at test FX
    expect(c.requiredInvestment.plan).toBe('business')
    const v = buildPlanComparison(c, fmt, 'en')!
    expect(v.rows.find((r) => r.plan === 'operational')!.recommended).toBe(true)
    expect(v.rows.find((r) => r.plan === 'business')!.recommended).toBe(false)
    expect(v.recommendation).toMatch(/^We recommend the Operational plan: the Business plan \(the match for your team size\) would cost .* a year, more than the .* a year this scope creates\. Move up to Business when more people need access or usage grows\.$/)
    const id = buildPlanComparison(c, fmt, 'id')!
    expect(id.recommendation).toMatch(/^Kami merekomendasikan plan Operational: plan Business/)
    // and it never recommends a plan that is a net loss when a cheaper one is not
    expect(v.rows.find((r) => r.recommended)!.shareTone).toBe('good')
  })

  it('says plainly that the plan is not in the figures, and explains the sizing rule', () => {
    const v = buildPlanComparison(calcOf(), fmt, 'en')!
    expect(v.caveat).toMatch(/not part of the Financial Case figures/)
    expect(v.caveat).toMatch(/one-time package and your team's setup time/)
    expect(v.caveat).toMatch(/1–5 Operational, 6–200 Business, over 200 Enterprise/)
    expect(v.caveat).toMatch(/how many people use Aivory/)
  })

  it('says the plan is assumed when team size is unknown', () => {
    const v = buildPlanComparison(calcOf({ fte_count: 'Not sure' }), fmt, 'en')!
    expect(v.recommendation).toBe('We recommend the Operational plan: your team size was not given, so the entry plan is assumed.')
  })

  it('adds Enterprise only when it is the recommendation, and is localized', () => {
    const big = buildPlanComparison(calcOf({ fte_count: 'Over 200 FTEs' }), fmt, 'en')!
    expect(big.rows.map((r) => r.plan)).toEqual(['operational', 'business', 'enterprise'])
    expect(big.rows[2].price).toMatch(/Priced by sales/)
    const id = buildPlanComparison(calcOf(BIG), fmt, 'id')!
    expect(id.heading).toBe('Rekomendasi plan Aivory')
    expect(id.recommendation).toBe('Kami merekomendasikan plan Business: sesuai untuk 6–200 karyawan dalam cakupan.')
    expect(id.rows[1].who).toBe('Tim hingga 5 orang (5 kursi)')
    expect(id.labels.recommended).toBe('Direkomendasikan')
  })

  it('on an older stored report (plan inside the figures) it says so instead of claiming otherwise', () => {
    const c = calcOf()
    const legacy = { ...c, requiredInvestment: { ...c.requiredInvestment, annualRecurringUSD: 1188 } }
    expect(buildPlanComparison(legacy, fmt, 'en')!.caveat).toMatch(/already counted in the running cost/)
  })

  it('is null on the old whole-budget basis', () => {
    expect(buildPlanComparison({ investmentBasis: 'stated_budget' }, fmt, 'en')).toBeNull()
    expect(buildPlanComparison(null, fmt, 'en')).toBeNull()
  })
})

describe('the investment section no longer lists the plan as a cost', () => {
  it('has package, setup and total only; the plan appears only as a note', () => {
    const v = buildRequiredInvestmentView(calcOf(), fmt, 'en')!
    const labels = v.rows.map((r) => r.label)
    expect(labels.some((l) => /plan/i.test(l))).toBe(false)
    expect(labels).toContain('Investment required — year 1')
    expect(v.explanation).toMatch(/the one-time package plus your team's setup time/)
    expect(v.footnote).toMatch(/plan subscription is not part of these figures/)
    expect(v.planNote).toMatch(/We recommend the Operational plan/) // small reported case: stepped down
  })

  it('keeps the plan rows for an older stored report whose figures include it', () => {
    const c = calcOf()
    const r = c.requiredInvestment
    const legacy = { ...c, requiredInvestment: { ...r, initialUSD: r.initialUSD + 99 * r.planMonthsYear1, annualRecurringUSD: 1188 } }
    const labels = buildRequiredInvestmentView(legacy, fmt, 'en')!.rows.map((x) => x.label)
    expect(labels.some((l) => /Business plan × 11 months/.test(l))).toBe(true)
    expect(labels.some((l) => /Recurring from year 2/.test(l))).toBe(true)
  })
})

describe('the financial-terms note', () => {
  it('without a running cost it says the ROI tile and range share one investment, and where the plan went', () => {
    const t = buildFinancialTermsNote('en', 3, { basis: 'required', hasRunningCost: false })
    expect(t).toMatch(/use the same investment/)
    expect(t).not.toMatch(/BEFORE running costs/)
    expect(t).toMatch(/shown as a recommendation/)
    expect(buildFinancialTermsNote('id', 3, { basis: 'required', hasRunningCost: false })).toMatch(/memakai investasi yang sama/)
  })
  it('older stored reports keep the before/after running cost explanation', () => {
    expect(buildFinancialTermsNote('en', 3, { basis: 'required', hasRunningCost: true })).toMatch(/BEFORE running costs/)
    expect(buildFinancialTermsNote('en', 3, { basis: 'required' })).toMatch(/BEFORE running costs/)
  })
})
