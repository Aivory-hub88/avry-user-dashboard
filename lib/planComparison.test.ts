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
// Pain points that make the report recommend software: Mekari Jurnal is priced for a whole team (US$20/mo),
// Looker Studio is free, Mekari Qontak / Zoho Desk are per user and Xendit is a transaction fee (not priced).
const SOFT = {
  operating_country: 'Indonesia',
  pain_points: 'sales outreach is manual; lead follow up in whatsapp; invoices',
}
const calcOf = (extra: Record<string, unknown> = {}) => buildDiagnosticContext({ ...ANSWERS, ...extra } as any).calculations as any
const fmt = (v: number) => `${v < 0 ? '-' : ''}Rp ${Math.abs(Math.round(v)).toLocaleString('en-US')}`
const MICRO = 'Micro (2–10 employees)'
/** A requiredInvestment as stored before the transformation model: no costModel, no software lines. */
const oldRI = (ri: any, plan: boolean) => ({
  ...ri, costModel: undefined, softwareLines: undefined, softwareAnnualUSD: undefined, unpriced: undefined,
  initialUSD: ri.packageUSD + ri.setupUSD + (plan ? ri.planMonthlyUSD * ri.planMonthsYear1 : 0),
  annualRecurringUSD: plan ? ri.planMonthlyUSD * 12 : 0,
})

describe('the case prices the user\'s actual transformation, not an Aivory quote', () => {
  it('investment = own setup effort + recommended software priced for a team; Aivory package and plan are not in it', () => {
    const c = calcOf(SOFT)
    const r = c.requiredInvestment
    expect(r.costModel).toBe('transformation')
    expect(r.softwareAnnualUSD).toBe(240) // Mekari Jurnal US$20 x 12; Looker Studio is free
    expect(r.initialUSD).toBe(r.setupUSD + r.softwareAnnualUSD)
    expect(r.annualRecurringUSD).toBe(r.softwareAnnualUSD)
    expect(r.initialUSD).toBeLessThan(r.setupUSD + r.packageUSD + r.softwareAnnualUSD) // the Aivory package is not in it
    expect(hasRunningCost(c)).toBe(true)
  })

  it('what cannot be priced without inventing a number is listed, not guessed', () => {
    const r = calcOf(SOFT).requiredInvestment
    const sw = r.unpriced.filter((i: any) => i.kind === 'software').map((i: any) => i.title)
    expect(sw).toEqual(expect.arrayContaining(['Mekari Qontak', 'Zoho Desk', 'Xendit']))
    expect(sw).not.toContain('Mekari Jurnal') // priced
    expect(sw).not.toContain('Google Looker Studio') // free
    expect(sw).not.toContain('HubSpot CRM') // free tier, per user
    expect(r.unpriced.some((i: any) => i.kind === 'data_prep')).toBe(true)
  })

  it('with a running cost the HEADLINE Payback and ROI already deduct it (no flattering gross figure next to a net one)', () => {
    const c = calcOf(SOFT)
    expect(c.headlineBasis).toBe('net')
    expect(c.paybackMonths).toBe(c.netPaybackMonths)
    expect(c.horizonROIPercent).toBe(c.netHorizonROIPercent)
    expect(c.threeYearROIPercent).toBe(c.netHorizonROIPercent)
    // the gross values are still there, and are the better-looking ones
    expect(c.grossPaybackMonths).toBeLessThan(c.paybackMonths)
    expect(c.grossHorizonROIPercent).toBeGreaterThan(c.horizonROIPercent)
    expect(c.netAnnualSavingsUSD).toBeCloseTo(c.totalAnnualSavingsUSD - 240, 6)
  })

  it('with no running cost there is one basis everywhere and no gross/net split', () => {
    const c = calcOf() // no pain points, no software
    expect(c.requiredInvestment.softwareAnnualUSD).toBe(0)
    expect(hasRunningCost(c)).toBe(false)
    expect(c.headlineBasis).toBe('gross')
    expect(c.netAnnualSavingsUSD).toBe(c.totalAnnualSavingsUSD)
    expect(c.netPaybackMonths).toBeCloseTo(c.paybackMonths, 0)
  })

  it('the reported 6-15 FTE case has positive net savings; the plan is still Business (a recommendation)', () => {
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

describe('buildPlanComparison: Aivory as ONE delivery option', () => {
  it('for a team shows Business and Enterprise (no Operational), recommends Business, and states who each is for', () => {
    const v = buildPlanComparison(calcOf(), fmt, 'en', { companySize: MICRO, fte: 10 })!
    expect(v.heading).toBe('Delivering it with Aivory: one option')
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

  it('states what delivering with Aivory costs: the one-time package plus the plan', () => {
    const c = calcOf()
    const fx = c.fxRateUsed
    const v = buildPlanComparison(c, fmt, 'en', { companySize: MICRO, fte: 10 })!
    expect(v.optionLine).toBe(`If you deliver it with Aivory: the Complete Transformation Package ${fmt(299 * fx)} (one-time, covers the first month), then the Business plan at ${fmt(99 * 12 * fx)} a year.`)
    const ent = buildPlanComparison(c, fmt, 'en', { companySize: 'Large (251–1,000 employees)', fte: 300 })!
    expect(ent.optionLine).toMatch(/plus the Enterprise plan, priced by sales\.$/)
    expect(buildPlanComparison(c, fmt, 'id', { companySize: MICRO, fte: 10 })!.optionLine).toMatch(/^Jika dikerjakan dengan Aivory: Complete Transformation Package /)
  })

  it('says plainly that these costs are not in the Financial Case, which covers your own effort and the recommended software', () => {
    const v = buildPlanComparison(calcOf(), fmt, 'en', { companySize: MICRO, fte: 10 })!
    expect(v.caveat).toMatch(/These Aivory costs are not part of the Financial Case figures above/)
    expect(v.caveat).toMatch(/your team's own setup effort and the software the report recommends/)
    expect(v.caveat).toMatch(/Aivory is one way to deliver the automation/)
    expect(v.caveat).toMatch(/working alone Operational \(1 seat\); more than one person Business or Enterprise/)
    expect(v.caveat).toMatch(/how many people use Aivory/)
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
    const v = buildPlanComparison(calcOf(), fmt, 'en', { companySize: MICRO, fte: 10 })!
    const biz = v.rows.find((r) => r.plan === 'business')!
    expect(v.rows.some((r) => r.plan === 'operational')).toBe(false)
    expect(biz.recommended).toBe(true)
    // the share above 100% is stated as a plain fact, not colour-coded
    expect('shareTone' in biz).toBe(false)
    expect(parseInt(biz.share as string, 10)).toBeGreaterThan(100)
  })

  it('solo: Operational recommended, with Business as the step up', () => {
    const v = buildPlanComparison(calcOf(), fmt, 'en', { companySize: SOLO_COMPANY_SIZE, fte: null })!
    expect(v.rows.map((r) => r.plan)).toEqual(['operational', 'business'])
    expect(v.rows[0].recommended).toBe(true)
    expect(v.recommendation).toBe('We recommend the Operational plan: you work on your own, and it is built for one person (1 seat).')
    expect(v.rows[0].who).toBe('1 person (1 seat)')
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
    expect(buildPlanComparison(stored, fmt, 'en')!.rows.find((r) => r.recommended)!.plan).toBe(stored.requiredInvestment.plan)
  })

  it('is localized', () => {
    const id = buildPlanComparison(calcOf(), fmt, 'id', { companySize: MICRO, fte: 10 })!
    expect(id.heading).toBe('Mengerjakannya dengan Aivory: salah satu opsi')
    expect(id.recommendation).toMatch(/^Kami merekomendasikan plan Business: tim Anda lebih dari satu orang, dan plan ini mencakup hingga 5 kursi\./)
    expect(id.rows[0].who).toBe('Tim hingga 5 orang (5 kursi)')
    expect(id.rows[1].yearly).toBe('Dihargai tim sales')
    expect(id.labels.recommended).toBe('Direkomendasikan')
  })

  it('on an older stored report whose figures include the plan, it says so instead of claiming otherwise', () => {
    const c = calcOf()
    const legacy = { ...c, requiredInvestment: oldRI(c.requiredInvestment, true) }
    expect(buildPlanComparison(legacy, fmt, 'en')!.caveat).toMatch(/already counted in the running cost/)
  })

  it('is null on the old whole-budget basis', () => {
    expect(buildPlanComparison({ investmentBasis: 'stated_budget' }, fmt, 'en')).toBeNull()
    expect(buildPlanComparison(null, fmt, 'en')).toBeNull()
  })
})

describe('the investment section', () => {
  it('lists your own setup and the priced software; no Aivory package or plan line', () => {
    const v = buildRequiredInvestmentView(calcOf(SOFT), fmt, 'en')!
    const labels = v.rows.map((r) => r.label)
    expect(labels[0]).toMatch(/^Setup & integration by your team/)
    expect(labels.some((l) => /^Mekari Jurnal .* — team plan, 12 months$/.test(l))).toBe(true)
    expect(labels.some((l) => /Looker Studio/.test(l))).toBe(true) // free: priced at 0
    expect(labels.some((l) => /Mekari Qontak|Zoho Desk|Xendit/.test(l))).toBe(false) // not priced: not a row
    expect(labels.some((l) => /Aivory|Complete Transformation Package|Business plan|Operational plan|Enterprise plan/.test(l))).toBe(false)
    expect(labels).toContain('Investment required — year 1')
    expect(labels).toContain('Recurring from year 2 (recommended software)')
    expect(v.explanation).toMatch(/your team's setup effort plus the recommended software priced as team plans/)
    expect(v.footnote).toMatch(/Aivory package and plan are not part of these figures/)
    expect(v.planNote).toMatch(/We recommend the Business plan/)
  })

  it('says what it did NOT price and why, so no number is invented', () => {
    const note = buildRequiredInvestmentView(calcOf(SOFT), fmt, 'en')!.unpricedNote!
    expect(note).toMatch(/^Not priced in these figures \(each needs information the report does not have, and no number is invented\): /)
    expect(note).toMatch(/software that needs a seat count or a vendor quote: .*Mekari Qontak \(priced per user\)/)
    expect(note).toMatch(/Xendit \(a per-transaction fee\)/)
    expect(note).toMatch(/data and process preparation before /)
    const id = buildRequiredInvestmentView(calcOf(SOFT), fmt, 'id')!.unpricedNote!
    expect(id).toMatch(/^Belum diberi harga di angka ini/)
    expect(id).toMatch(/harga per pengguna/)
  })

  it('no running-cost row when no software is priced', () => {
    const labels = buildRequiredInvestmentView(calcOf(), fmt, 'en')!.rows.map((r) => r.label)
    expect(labels.some((l) => /Recurring/.test(l))).toBe(false)
  })

  it('an older report priced on Aivory package + setup keeps showing the package row', () => {
    const c = calcOf()
    const v2 = { ...c, requiredInvestment: oldRI(c.requiredInvestment, false) }
    const labels = buildRequiredInvestmentView(v2, fmt, 'en')!.rows.map((x) => x.label)
    expect(labels[0]).toBe('Complete Transformation Package (one-time)')
  })

  it('an older report whose figures include the plan keeps the plan rows', () => {
    const c = calcOf()
    const v1 = { ...c, requiredInvestment: oldRI(c.requiredInvestment, true) }
    const labels = buildRequiredInvestmentView(v1, fmt, 'en')!.rows.map((x) => x.label)
    expect(labels.some((l) => /Business plan × 11 months/.test(l))).toBe(true)
    expect(labels.some((l) => /Recurring from year 2/.test(l))).toBe(true)
  })
})

describe('the financial-terms note', () => {
  it('headline net: Payback, ROI tile and range all deduct the recommended software, and Aivory is one option', () => {
    const t = buildFinancialTermsNote('en', 3, { basis: 'required', hasRunningCost: true, headlineNet: true })
    expect(t).toMatch(/Payback tile, the 3-Year ROI tile and the 3-Year ROI range all deduct the yearly cost of the recommended software/)
    expect(t).not.toMatch(/BEFORE running costs/)
    expect(t).toMatch(/Aivory is shown as one way to deliver the automation/)
    expect(buildFinancialTermsNote('id', 3, { basis: 'required', hasRunningCost: true, headlineNet: true })).toMatch(/sudah mengurangkan biaya tahunan software/)
  })
  it('without a running cost it says the ROI tile and range share one investment, and where the plan went', () => {
    const t = buildFinancialTermsNote('en', 3, { basis: 'required', hasRunningCost: false })
    expect(t).toMatch(/use the same investment/)
    expect(t).not.toMatch(/BEFORE running costs/)
    expect(buildFinancialTermsNote('id', 3, { basis: 'required', hasRunningCost: false })).toMatch(/memakai investasi yang sama/)
  })
  it('older stored reports keep the before/after running cost explanation', () => {
    expect(buildFinancialTermsNote('en', 3, { basis: 'required', hasRunningCost: true })).toMatch(/BEFORE running costs/)
    expect(buildFinancialTermsNote('en', 3, { basis: 'required' })).toMatch(/BEFORE running costs/)
  })
})
