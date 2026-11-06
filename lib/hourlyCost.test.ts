import { describe, it, expect, beforeEach } from 'vitest'
import { buildDiagnosticContext, parseHourlyCostLocal, calculateROI } from '@/services/deepDiagnostic'
import { DeepDiagnosticService } from '@/services/deepDiagnostic'
import { DEEP_DIAGNOSTIC_PHASES } from '@/constants/deepDiagnosticQuestions'
import { ID_QUESTION_COPY } from '@/constants/deepDiagnosticQuestionsId'

beforeEach(() => {
  ;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})

const BASE = {
  currency: 'IDR — Indonesian Rupiah (Rp)', industry: 'Technology / Software',
  manual_hours_weekly: '25-50 hours/week', fte_count: '6-15 FTEs',
  automation_current: '10-25%', target_automation: '50-75%', budget_range: '$10K - $50K',
  priority_areas: ['Operations and logistics', 'Customer service/support'],
}
const calc = (extra: Record<string, unknown> = {}) => buildDiagnosticContext({ ...BASE, ...extra } as any).calculations as any

describe('parseHourlyCostLocal', () => {
  it('accepts positive numbers and numeric strings, rejects the rest', () => {
    expect(parseHourlyCostLocal(87669)).toBe(87669)
    expect(parseHourlyCostLocal('150000')).toBe(150000)
    expect(parseHourlyCostLocal(0)).toBeNull()
    expect(parseHourlyCostLocal(-5)).toBeNull()
    expect(parseHourlyCostLocal('')).toBeNull()
    expect(parseHourlyCostLocal('abc')).toBeNull()
    expect(parseHourlyCostLocal(undefined)).toBeNull()
    expect(parseHourlyCostLocal(NaN)).toBeNull()
  })
})

describe('user-stated hourly cost', () => {
  it('is used instead of the market benchmark, and labelled as such', () => {
    const bench = calc()
    const own = calc({ hourly_cost: 200000 })
    expect(bench.hourlyRateSource).toBe('benchmark')
    expect(own.hourlyRateSource).toBe('user')
    expect(own.assumedHourlyRateLocal).toBeCloseTo(200000, 0)
    expect(own.smallTeamRateApplied).toBe(false)
    // savings scale with the stated rate (same hours): 200000 / benchmark
    const ratio = own.totalAnnualSavingsLocal / bench.totalAnnualSavingsLocal
    expect(ratio).toBeCloseTo(200000 / bench.assumedHourlyRateLocal, 2)
  })

  it('a higher stated cost turns a net-negative case around', () => {
    const lowRate = calc({ hourly_cost: 30000 })
    const highRate = calc({ hourly_cost: 250000 })
    expect(highRate.netAnnualSavingsLocal).toBeGreaterThan(lowRate.netAnnualSavingsLocal)
    expect(highRate.netAnnualSavingsLocal).toBeGreaterThan(0)
  })

  it('ignores an out-of-range value (a monthly salary typed as hourly) and says so', () => {
    const monthlySalary = calc({ hourly_cost: 8_000_000 }) // ~US$440/hour
    expect(monthlySalary.hourlyRateSource).toBe('benchmark')
    expect(monthlySalary.hourlyCostRejected).toBe(true)
    expect(monthlySalary.assumedHourlyRateLocal).toBeCloseTo(calc().assumedHourlyRateLocal, 0)
    expect(calc({ hourly_cost: 10 }).hourlyCostRejected).toBe(true) // ~US$0.0006/hour
  })

  it('empty or invalid input behaves exactly like before', () => {
    const none = calc()
    expect(none.hourlyCostRejected).toBe(false)
    expect(calc({ hourly_cost: '' }).totalAnnualSavingsLocal).toBe(none.totalAnnualSavingsLocal)
  })

  it('also wins over the small-team opportunity-cost discount on the USD path', () => {
    const usd = calculateROI(
      { totalManualHoursWeekly: 20, fteCountInScope: 3, currentAutomationPct: 20, targetAutomationPct: 70, budgetMidpointUSD: 20000, hourlyCostLocal: 40, ticketVolumePerDay: null, ahtCurrentMinutes: null, ahtTargetMinutes: null, costCurrentPerTicket: null, costTargetPerTicket: null, timelineMonths: null } as any,
      'USD',
      'Technology / Software',
    )
    expect(usd.hourlyRateSource).toBe('user')
    expect(usd.assumedHourlyRateUSD).toBe(40)
    expect(usd.smallTeamRateApplied).toBe(false)
  })
})

describe('the question itself', () => {
  const q = DEEP_DIAGNOSTIC_PHASES.flatMap((p) => p.questions).find((x) => x.id === 'hourly_cost')!
  it('exists, is an optional number with a minimum, and has Indonesian copy', () => {
    expect(q).toBeDefined()
    expect(q.type).toBe('number')
    expect(q.required).toBe(false)
    expect(q.validation?.min).toBe(1)
    expect(ID_QUESTION_COPY.hourly_cost.question).toMatch(/biaya satu jam kerja/)
    expect(ID_QUESTION_COPY.hourly_cost.helperText).toMatch(/Kosongkan/)
  })
  it('is optional: validatePhase skips it, and a zero/negative value is ignored by the parser', () => {
    const phase = DEEP_DIAGNOSTIC_PHASES.find((p) => p.questions.some((x) => x.id === 'hourly_cost'))!
    const onlyThis = { ...phase, questions: [q] }
    // optional questions are not validated, so empty (and 0) never block the user from continuing
    expect(DeepDiagnosticService.validatePhase(onlyThis, {})).toEqual({})
    expect(DeepDiagnosticService.validatePhase(onlyThis, { hourly_cost: 0 })).toEqual({})
    // ...and a non-positive value never reaches the calculation
    expect(parseHourlyCostLocal(0)).toBeNull()
    expect(calc({ hourly_cost: 0 }).hourlyRateSource).toBe('benchmark')
    expect(calc({ hourly_cost: -50000 }).hourlyRateSource).toBe('benchmark')
  })
})
