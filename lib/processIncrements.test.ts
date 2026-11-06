import { describe, it, expect, beforeEach } from 'vitest'
import { buildDiagnosticContext } from '@/services/deepDiagnostic'
import { buildProcessIncrements, formatIncrementLine, formatIncrementsSummary } from './processIncrements'
import type { RankedOpportunity } from '@/types/diagnostic'

beforeEach(() => {
  ;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})

const opp = (id: string, impact: number, training = false) =>
  ({ id, title: id, impact, complexity: 'medium', ...(training ? { trainingTracks: [] } : {}) }) as unknown as RankedOpportunity

describe('buildProcessIncrements', () => {
  const opps = [opp('a', 6), opp('b', 3), opp('c', 1), opp('train', 5, true)]
  const q = { totalManualHoursWeekly: 20, currentAutomationPct: 20, targetAutomationPct: 70 }
  // 20 h/week x 52 = 1,040 h/yr of manual work; 400 h/yr recovered
  const v = buildProcessIncrements(opps, { hoursReclaimedPerYear: 400 }, q)

  it('splits the total improvement by impact weight: shares add up to 100%', () => {
    expect(v.byId.a.sharePct).toBeCloseTo(60, 6)
    expect(v.byId.b.sharePct).toBeCloseTo(30, 6)
    expect(v.byId.c.sharePct).toBeCloseTo(10, 6)
    const total = Object.values(v.byId).reduce((s, i) => s + i.sharePct, 0)
    expect(total).toBeCloseTo(100, 6)
  })

  it("each process's removed workload is its share of the total, and they add up to the total removed", () => {
    expect(v.byId.a.hoursPerYear).toBeCloseTo(240, 6)
    expect(v.byId.a.workloadRemovedPct).toBeCloseTo((240 / 1040) * 100, 6)
    const hours = Object.values(v.byId).reduce((s, i) => s + i.hoursPerYear, 0)
    const wl = Object.values(v.byId).reduce((s, i) => s + i.workloadRemovedPct, 0)
    expect(hours).toBeCloseTo(400, 6)
    expect(wl).toBeCloseTo(v.summary!.workloadRemovedPct, 6)
    expect(v.summary!.workloadRemovedPct).toBeCloseTo((400 / 1040) * 100, 6)
  })

  it('training is a capability investment with no savings of its own: no increment', () => {
    expect(v.byId.train).toBeUndefined()
  })

  it('summary carries the automation level change', () => {
    expect(v.summary).toMatchObject({ automationFromPct: 20, automationToPct: 70, hoursReclaimedPerYear: 400, manualHoursPerYear: 1040 })
  })

  it('returns nothing rather than inventing numbers when hours are missing', () => {
    expect(buildProcessIncrements(opps, { hoursReclaimedPerYear: null }, q)).toEqual({ byId: {}, summary: null })
    expect(buildProcessIncrements(opps, { hoursReclaimedPerYear: 400 }, { ...q, totalManualHoursWeekly: null })).toEqual({ byId: {}, summary: null })
    expect(buildProcessIncrements([], { hoursReclaimedPerYear: 400 }, q)).toEqual({ byId: {}, summary: null })
    expect(buildProcessIncrements(null, null, null)).toEqual({ byId: {}, summary: null })
  })

  it('works on a real report, from stored fields only (so older reports get it too)', () => {
    const ctx: any = buildDiagnosticContext({
      currency: 'IDR — Indonesian Rupiah (Rp)', industry: 'Technology / Software',
      manual_hours_weekly: '25-50 hours/week', fte_count: '6-15 FTEs',
      automation_current: '10-25%', target_automation: '50-75%',
      pain_points: 'sales outreach is manual; lead follow up in whatsapp; invoices',
      priority_areas: ['Operations and logistics', 'Customer service/support'],
    } as any)
    const real = buildProcessIncrements(ctx.opportunities, ctx.calculations, ctx.quantitative)
    const ids = Object.keys(real.byId)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.reduce((s, id) => s + real.byId[id].sharePct, 0)).toBeCloseTo(100, 6)
    expect(ids.reduce((s, id) => s + real.byId[id].hoursPerYear, 0)).toBeCloseTo(ctx.calculations.hoursReclaimedPerYear, 6)
    // today's automation 17.5% -> 62.5% with a 75% efficiency allowance removes 33.75% of the manual workload
    expect(real.summary!.workloadRemovedPct).toBeCloseTo(33.75, 0)
  })
})

describe('formatting', () => {
  const inc = { sharePct: 60, workloadRemovedPct: 23.0769, hoursPerYear: 240 }
  it('one line per opportunity, en and id', () => {
    expect(formatIncrementLine(inc, 'en')).toBe("Contributes 60% of the improvement · removes 23% of today's manual workload (~240 h/yr)")
    expect(formatIncrementLine(inc, 'id')).toBe('Menyumbang 60% dari peningkatan · mengurangi 23% beban kerja manual saat ini (±240 jam/tahun)')
  })
  it('small percentages keep one decimal instead of rounding to 0', () => {
    expect(formatIncrementLine({ sharePct: 4.2, workloadRemovedPct: 1.04, hoursPerYear: 11 }, 'en')).toMatch(/^Contributes 4\.2% of the improvement · removes 1% of today's/)
    expect(formatIncrementLine({ sharePct: 4.25, workloadRemovedPct: 0.46, hoursPerYear: 5 }, 'en')).toMatch(/removes 0\.5% of today's/)
  })
  it('the summary states the overall change and says the per-process split is an allocation', () => {
    const v = buildProcessIncrements([opp('a', 6)], { hoursReclaimedPerYear: 400 }, { totalManualHoursWeekly: 20, currentAutomationPct: 20, targetAutomationPct: 70 })
    const t = formatIncrementsSummary(v, 'en')!
    expect(t).toMatch(/^Automation level goes from 20% to 70% \(\+50 points\)\. Together, the opportunities below remove 38% of today's manual workload \(400 of 1,040 hours a year, after an efficiency allowance\)\./)
    expect(t).toMatch(/the model measures the total improvement, not each process separately/)
    expect(formatIncrementsSummary(v, 'id')).toMatch(/Tingkat otomasi naik dari 20% ke 70% \(\+50 poin\)/)
    expect(formatIncrementsSummary({ byId: {}, summary: null }, 'en')).toBeNull()
  })
})
