import { describe, it, expect, beforeEach } from 'vitest'
import { buildDiagnosticContext, resolveManualHours } from '@/services/deepDiagnostic'
import { describeTeamHours } from './teamHours'
import { DEEP_DIAGNOSTIC_PHASES } from '@/constants/deepDiagnosticQuestions'
import { ID_QUESTION_COPY } from '@/constants/deepDiagnosticQuestionsId'

beforeEach(() => {
  ;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})

const SOLO = 'Solo / Freelancer (1 person)'
const BASE = {
  currency: 'IDR — Indonesian Rupiah (Rp)', industry: 'Technology / Software', hourly_cost: 75000,
  automation_current: '10-25%', target_automation: '50-75%',
  priority_areas: ['Operations and logistics', 'Customer service/support'],
}
const ctx = (extra: Record<string, unknown>) => buildDiagnosticContext({ ...BASE, ...extra } as any) as any

describe('resolveManualHours: per-person hours x team size', () => {
  it('multiplies the per-person hours by the team size answered', () => {
    expect(resolveManualHours({ manual_hours_per_person: '2-5 hours/person/week' }, 10)).toEqual({ totalWeekly: 35, perPerson: 3.5, people: 10, source: 'fte' })
    expect(resolveManualHours({ manual_hours_per_person: 'Under 2 hours/person/week' }, 33)).toMatchObject({ totalWeekly: 33, people: 33 })
    expect(resolveManualHours({ manual_hours_per_person: 'Over 20 hours/person/week' }, 3)).toMatchObject({ totalWeekly: 75 })
  })

  it('solo is one person, whatever the employee count says', () => {
    expect(resolveManualHours({ manual_hours_per_person: '5-10 hours/person/week', company_size: SOLO }, 10)).toEqual({ totalWeekly: 7.5, perPerson: 7.5, people: 1, source: 'solo' })
  })

  it('team size not given: counted for ONE person, and the source says so (never silently scaled)', () => {
    expect(resolveManualHours({ manual_hours_per_person: '5-10 hours/person/week' }, null)).toEqual({ totalWeekly: 7.5, perPerson: 7.5, people: 1, source: 'assumed_one' })
  })

  it('"Not sure" or no answer gives no total (the projection then reports it as missing)', () => {
    expect(resolveManualHours({ manual_hours_per_person: 'Not sure' }, 10).totalWeekly).toBeNull()
    expect(resolveManualHours({}, 10).totalWeekly).toBeNull()
  })

  it('answers saved as a team-wide total are read exactly as before', () => {
    expect(resolveManualHours({ manual_hours_weekly: '25-50 hours/week' }, 10)).toEqual({ totalWeekly: 37, perPerson: null, people: null, source: 'team_total' })
    // the open top bucket still scales with headcount (existing behaviour)
    expect(resolveManualHours({ manual_hours_weekly: 'Over 100 hours/week' }, 300).totalWeekly).toBe(600)
    // the new answer wins when both exist
    expect(resolveManualHours({ manual_hours_per_person: '2-5 hours/person/week', manual_hours_weekly: '25-50 hours/week' }, 10).totalWeekly).toBe(35)
  })
})

describe('the value now scales with the team', () => {
  const PP = { manual_hours_per_person: '2-5 hours/person/week' }

  it('10 people recover ten times what 1 person recovers for the same per-person answer', () => {
    const team = ctx({ ...PP, fte_count: '6-15 FTEs', company_size: 'Micro (2–10 employees)' }).calculations
    const solo = ctx({ ...PP, fte_count: '6-15 FTEs', company_size: SOLO }).calculations
    expect(team.hoursReclaimedPerYear / solo.hoursReclaimedPerYear).toBeCloseTo(10, 0)
    expect(team.totalAnnualSavingsLocal / solo.totalAnnualSavingsLocal).toBeCloseTo(10, 0)
  })

  it('stores how the total was derived, and it feeds every downstream consumer through totalManualHoursWeekly', () => {
    const c = ctx({ ...PP, fte_count: '6-15 FTEs', company_size: 'Micro (2–10 employees)' })
    expect(c.quantitative).toMatchObject({ totalManualHoursWeekly: 35, manualHoursPerPersonWeekly: 3.5, teamSizeCounted: 10, teamSizeSource: 'fte' })
  })

  it('a team that gives no size is counted for one person and says so, so the missing input shows', () => {
    const c = ctx({ ...PP, fte_count: 'Not sure' })
    expect(c.quantitative.teamSizeSource).toBe('assumed_one')
    expect(c.calculations.missingInputs).toContain('FTE count')
  })

  it('an old report (team-wide answer) is unchanged', () => {
    const c = ctx({ manual_hours_weekly: '10-25 hours/week', fte_count: '6-15 FTEs' })
    expect(c.quantitative.totalManualHoursWeekly).toBe(17)
    expect(c.quantitative.teamSizeSource).toBe('team_total')
  })
})

describe('describeTeamHours', () => {
  it('shows N people x hours = total, en and id', () => {
    const q = { totalManualHoursWeekly: 35, manualHoursPerPersonWeekly: 3.5, teamSizeCounted: 10, teamSizeSource: 'fte' as const }
    expect(describeTeamHours(q, 'en')).toBe('10 people × 3.5 h/person/week = 35 h/week of manual work')
    expect(describeTeamHours(q, 'id')).toBe('10 orang × 3.5 jam/orang/minggu = 35 jam/minggu kerja manual')
  })
  it('solo, and the honest note when the team size was not given', () => {
    expect(describeTeamHours({ manualHoursPerPersonWeekly: 7.5, teamSizeCounted: 1, teamSizeSource: 'solo' }, 'en')).toBe('1 person × 7.5 h/week')
    expect(describeTeamHours({ manualHoursPerPersonWeekly: 7.5, teamSizeCounted: 1, teamSizeSource: 'assumed_one' }, 'en')).toMatch(/^Counted for 1 person \(7\.5 h\/week\) because team size was not given\./)
    expect(describeTeamHours({ manualHoursPerPersonWeekly: 7.5, teamSizeCounted: 1, teamSizeSource: 'assumed_one' }, 'id')).toMatch(/^Dihitung untuk 1 orang/)
  })
  it('nothing for reports saved with a team-wide total, or with no data', () => {
    expect(describeTeamHours({ totalManualHoursWeekly: 37, teamSizeSource: 'team_total' }, 'en')).toBeNull()
    expect(describeTeamHours({ totalManualHoursWeekly: 37 }, 'en')).toBeNull()
    expect(describeTeamHours(null, 'en')).toBeNull()
  })
})

describe('the question', () => {
  const qs = DEEP_DIAGNOSTIC_PHASES.flatMap((p) => p.questions)
  it('asks per person, is optional, and has aligned Indonesian copy', () => {
    const q = qs.find((x) => x.id === 'manual_hours_per_person')!
    expect(q.question).toMatch(/ONE person/)
    expect(q.options).toEqual(['Under 2 hours/person/week', '2-5 hours/person/week', '5-10 hours/person/week', '10-20 hours/person/week', 'Over 20 hours/person/week', 'Not sure'])
    expect(ID_QUESTION_COPY.manual_hours_per_person.options).toHaveLength(q.options!.length)
    expect(ID_QUESTION_COPY.manual_hours_per_person.question).toMatch(/SATU orang/)
  })
  it('the team-wide question is gone from the form (old answers are still read)', () => {
    expect(qs.some((x) => x.id === 'manual_hours_weekly')).toBe(false)
  })
})
