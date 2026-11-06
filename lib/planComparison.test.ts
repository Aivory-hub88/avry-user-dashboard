import { describe, it, expect, beforeEach } from 'vitest'
import { buildDiagnosticContext } from '@/services/deepDiagnostic'
import { buildPlanComparison } from './planComparison'
import { buildRequiredInvestmentView } from './requiredInvestmentView'
import { hasRunningCost } from './runningCost'
import { buildFinancialTermsNote } from './readinessNarrative'
import { planForTeam, SOLO_COMPANY_SIZE } from './planForTeam'

beforeEach(() => {
  ;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})

// The reported case: IDR, tech, 6-15 FTEs, small manual workload (a team, so Business).
const ANSWERS = {
  currency: 'IDR — Indonesian Rupiah (Rp)', industry: 'Technology / Software',
  manual_hours_weekly: 'Under 10 hours/week', fte_count: '6-15 FTEs',
  automation_current: '10-25%', target_automation: '50-75%',
  priority_areas: ['Operations and logistics', 'Customer service/support'],
}
const calcOf = (extra: Record<string, unknown> = {}) => buildDiagnosticContext({ ...ANSWERS, ...extra } as any).calculations as any
const fmt = (v: number) => `${v < 0 ? '-' : ''}Rp ${Math.abs(Math.round(v)).toLocaleString('en-US')}`
const MICRO = 'Micro (2–10 employees)'

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

  it('the reported 6-15 FTE case has positive net savings and the plan is still Business', () => {
    const c = calcOf()
    expect(c.requiredInvestment.plan).toBe('business')
    expect(c.netAnnualSavingsLocal).toBeGreaterThan(0)
  })

  it('stored older reports (plan inside the figures) are still recognised as having a running cost', () => {
    expect(hasRunningCost({ annualOngoingCostUSD: 1188 })).toBe(true)
    expect(hasRunningCost({ annualOngoingCostLocal: 21_510_762 })).toBe(true)
    expect(hasRunningCost({ annualOngoingCostUSD: 0 })).toBe(false)
    expect(hasRunningCost(null)).toBe(false)
  })
})

describe('planForTeam: solo gets Operational; a team gets Business or Enterprise', () => {
  it('solo (company size) -> Operational, whatever the employee count says', () => {
    expect(planForTeam(null, SOLO_COMPANY_SIZE)).toEqual({ plan: 'operational', assumed: false })
    expect(planForTeam(3, SOLO_COMPANY_SIZE)).toEqual({ plan: 'operational', assumed: false })
  })
  it('anyone else is a team: Business, or Enterprise above 200 employees in scope; never Operational', () => {
    expect(planForTeam(null, MICRO)).toEqual({ plan: 'business', assumed: false })
    expect(planForTeam(3, MICRO)).toEqual({ plan: 'business', assumed: false })
    expect(planForTeam(33, 'Small (11–50 employees)')).toEqual({ plan: 'business', assumed: false })
    expect(planForTeam(300, 'Large (251–1,000 employees)')).toEqual({ plan: 'enterprise', assumed: false })
  })
  it('older reports without company size fall back to the employee count; nothing known -> assumed entry plan', () => {
    expect(planForTeam(1, null)).toEqual({ plan: 'operational', assumed: false })
    expect(planForTeam(3, null)).toEqual({ plan: 'business', assumed: false })
    expect(planForTeam(null, null)).toEqual({ plan: 'operational', assumed: true })
  })
})

describe('buildPlanComparison (the recommendation card)', () => {
  it('for a team shows Business and Enterprise (no Operational), recommends Business, and states who each is for', () => {
    const v = buildPlanComparison(calcOf(), fmt, 'en', { companySize: MICRO, fte: 10 })!
    expect(v.heading).toBe('Recommended Aivory plan')
    expect(v.rows.map((r) => r.plan)).toEqual(['business', 'enterprise'])
    expect(v.rows[0].recommended).toBe(true)
    expect(v.rows[1].recommended).toBe(false)
    expect(v.recommendation).toBe('We recommend the Business plan: your team is more than one person, and it covers up to 5 seats. If more than 5 people will use Aivory, the option is Enterprise (15+ seats, by contract).')
    expect(v.rows[0].who).toBe('A team of up to 5 people (5 seats)')
    expect(v.rows[0].includes).toBe('6,500 Intelligence Credits per month')
    expect(v.rows[0].price).toMatch(/\/month \(US\$99\)$/)
    expect(v.rows[1].who).toBe('15+ people, by contract')
    expect(v.rows[1].price).toMatch(/^Priced by sales \(floor /)
  })

  it('shows the Business cost per year and its share of the value; Enterprise is sales-priced, so it has no share', () => {
    const c = calcOf()
    const v = buildPlanComparison(c, fmt, 'en', { companySize: MICRO, fte: 10 })!
    const fx = c.fxRateUsed
    const biz = v.rows.find((r) => r.plan === 'business')!
    const ent = v.rows.find((r) => r.plan === 'enterprise')!
    expect(biz.yearly).toBe(`${fmt(99 * 12 * fx)}/year`)
    expect(biz.share).toBe(`${Math.round((99 * 12 * fx / c.totalAnnualSavingsLocal) * 100)}% of the yearly value`)
    expect(ent.yearly).toBe('Priced by sales')
    expect(ent.share).toBeNull()
    expect(v.valueLine).toBe(`Value this scope creates: ${fmt(c.totalAnnualSavingsLocal)} per year (from the Financial Case).`)
    expect(JSON.stringify(v)).not.toMatch(/value left/i)
  })

  it('does NOT step a team down to Operational because the plan costs more than the value; it stays honest instead', () => {
    // small workload: Business costs more per year than the scope creates; teams stay on Business/Enterprise
    const v = buildPlanComparison(calcOf(), fmt, 'en', { companySize: MICRO, fte: 10 })!
    const biz = v.rows.find((r) => r.plan === 'business')!
    expect(v.rows.some((r) => r.plan === 'operational')).toBe(false)
    expect(biz.recommended).toBe(true)
    expect(biz.shareTone).toBe('bad') // more than 100% of the value: shown red, not hidden
    expect(parseInt(biz.share as string, 10)).toBeGreaterThan(100)
  })

  it('solo: Operational recommended, with Business as the step up', () => {
    const v = buildPlanComparison(calcOf(), fmt, 'en', { companySize: SOLO_COMPANY_SIZE, fte: null })!
    expect(v.rows.map((r) => r.plan)).toEqual(['operational', 'business'])
    expect(v.rows[0].recommended).toBe(true)
    expect(v.recommendation).toBe('We recommend the Operational plan: you work on your own, and it is built for one person (1 seat).')
    expect(v.rows[0].who).toBe('1 person (1 seat)')
    expect(v.rows[0].share).toMatch(/% of the yearly value$/)
  })

  it('over 200 employees in scope: Enterprise recommended, Business shown as the starting point', () => {
    const v = buildPlanComparison(calcOf(), fmt, 'en', { companySize: 'Large (251–1,000 employees)', fte: 300 })!
    expect(v.rows.map((r) => r.plan)).toEqual(['business', 'enterprise'])
    expect(v.rows.find((r) => r.recommended)!.plan).toBe('enterprise')
    expect(v.recommendation).toMatch(/^We recommend the Enterprise plan: more than 200 employees are in scope/)
  })

  it('nothing known about the team: assumed Operational, and it says so', () => {
    const v = buildPlanComparison(calcOf({ fte_count: 'Not sure' }), fmt, 'en', { companySize: null, fte: null })!
    expect(v.recommendation).toBe('We recommend the Operational plan: your team size is not known, so the entry plan is assumed. If more than one person will use Aivory, choose Business or Enterprise.')
  })

  it("older reports are judged by today's rule from the team passed in (a 1-5 FTE report is now Business)", () => {
    const stored = calcOf({ fte_count: '1-5 FTEs' })
    const v = buildPlanComparison(stored, fmt, 'en', { companySize: null, fte: 3 })!
    expect(v.rows.find((r) => r.recommended)!.plan).toBe('business')
    // without a team argument it falls back to the plan stored on the report
    expect(buildPlanComparison(stored, fmt, 'en')!.rows.find((r) => r.recommended)!.plan).toBe(stored.requiredInvestment.plan)
  })

  it('says plainly that the plan is not in the figures, and explains the rule', () => {
    const v = buildPlanComparison(calcOf(), fmt, 'en', { companySize: MICRO, fte: 10 })!
    expect(v.caveat).toMatch(/not part of the Financial Case figures/)
    expect(v.caveat).toMatch(/one-time package and your team's setup time/)
    expect(v.caveat).toMatch(/working alone Operational \(1 seat\); more than one person Business or Enterprise/)
    expect(v.caveat).toMatch(/how many people use Aivory/)
  })

  it('is localized', () => {
    const id = buildPlanComparison(calcOf(), fmt, 'id', { companySize: MICRO, fte: 10 })!
    expect(id.heading).toBe('Rekomendasi plan Aivory')
    expect(id.recommendation).toMatch(/^Kami merekomendasikan plan Business: tim Anda lebih dari satu orang, dan plan ini mencakup hingga 5 kursi\./)
    expect(id.rows[0].who).toBe('Tim hingga 5 orang (5 kursi)')
    expect(id.rows[1].yearly).toBe('Dihargai tim sales')
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
    expect(v.planNote).toMatch(/We recommend the Business plan/)
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
