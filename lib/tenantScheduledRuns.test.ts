import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SHAPE,
  buildCronExpression,
  parseCronExpression,
  type Cadence,
  type ScheduleShape,
} from './tenantScheduledRuns'

const shape = (over: Partial<ScheduleShape> = {}): ScheduleShape => ({ ...DEFAULT_SHAPE, ...over })

describe('buildCronExpression — the UI cannot express a schedule the backend will refuse', () => {
  it('always writes a literal minute, never a wildcard or a step', () => {
    // This is the safety property, not a formatting detail: the backend
    // rejects an every-minute field and any step finer than 15 minutes
    // because each run is a full, billable agent turn. If this builder could
    // ever emit `*` or `*/n` in the minute field, the form would be able to
    // create the exact schedule that floor exists to prevent.
    const cadences: Cadence[] = ['daily', 'weekdays', 'weekly', 'monthly']
    for (const cadence of cadences) {
      for (let minute = 0; minute < 60; minute += 7) {
        const field = buildCronExpression(shape({ cadence, minute })).split(' ')[0]
        expect(field).toMatch(/^\d+$/)
        expect(Number(field)).toBe(minute)
      }
    }
  })

  it('writes the five shapes the runtime accepts', () => {
    expect(buildCronExpression(shape({ cadence: 'daily', hour: 9, minute: 0 }))).toBe('0 9 * * *')
    expect(buildCronExpression(shape({ cadence: 'weekdays', hour: 8, minute: 30 }))).toBe('30 8 * * 1-5')
    expect(buildCronExpression(shape({ cadence: 'weekly', hour: 9, minute: 0, weekday: 1 }))).toBe('0 9 * * 1')
    expect(buildCronExpression(shape({ cadence: 'monthly', hour: 7, minute: 15, dayOfMonth: 28 }))).toBe('15 7 28 * *')
  })

  it('never writes a day past the 28th', () => {
    // A monthly run set for the 31st simply would not happen in most months.
    // A schedule that quietly does not run is worse than one that never
    // offered the date, so the clamp is part of the contract, not defence.
    expect(buildCronExpression(shape({ cadence: 'monthly', dayOfMonth: 31 }))).toBe('0 9 28 * *')
    expect(buildCronExpression(shape({ cadence: 'monthly', dayOfMonth: 0 }))).toBe('0 9 1 * *')
  })

  it('clamps out-of-range and non-finite times rather than emitting them', () => {
    expect(buildCronExpression(shape({ hour: 99, minute: -4 }))).toBe('0 23 * * *')
    expect(buildCronExpression(shape({ hour: NaN, minute: NaN }))).toBe('0 0 * * *')
  })
})

describe('parseCronExpression — editing reopens the controls that wrote the schedule', () => {
  it('round-trips everything the builder can produce', () => {
    const cases: ScheduleShape[] = [
      shape({ cadence: 'daily', hour: 0, minute: 0 }),
      shape({ cadence: 'daily', hour: 23, minute: 59 }),
      shape({ cadence: 'weekdays', hour: 8, minute: 30 }),
      shape({ cadence: 'weekly', hour: 18, minute: 5, weekday: 0 }),
      shape({ cadence: 'weekly', hour: 18, minute: 5, weekday: 6 }),
      shape({ cadence: 'monthly', hour: 7, minute: 45, dayOfMonth: 28 }),
    ]
    for (const original of cases) {
      const parsed = parseCronExpression(buildCronExpression(original))
      expect(parsed, buildCronExpression(original)).not.toBeNull()
      expect(parsed!.cadence).toBe(original.cadence)
      expect(parsed!.hour).toBe(original.hour)
      expect(parsed!.minute).toBe(original.minute)
      if (original.cadence === 'weekly') expect(parsed!.weekday).toBe(original.weekday)
      if (original.cadence === 'monthly') expect(parsed!.dayOfMonth).toBe(original.dayOfMonth)
    }
  })

  it('refuses anything this builder could not have written', () => {
    // The caller shows an unparseable expression verbatim and leaves it
    // alone. Returning a nearest-fit shape instead would silently rewrite a
    // tenant's schedule the next time they pressed Save on an unrelated
    // field — which is why every one of these must be null, not a guess.
    for (const expr of [
      '*/15 * * * *', // every 15 minutes — a real cron, no shape for it
      '0 9 * * 1,3,5', // multiple weekdays
      '0 9 1 1 *', // a specific month
      '0 9 * * MON', // named weekday, valid upstream, not ours
      '0 9 * * 7', // Sunday-as-7, which the runtime accepts and we write as 0
      '0 9 15 * 1', // both day-of-month and day-of-week
      '0 9 * *', // four fields
      '0 9 * * * *', // six fields
      '', // nothing
      'not a cron',
    ]) {
      expect(parseCronExpression(expr), expr).toBeNull()
    }
  })

  it('tolerates the whitespace a stored expression might carry', () => {
    expect(parseCronExpression('  0   9  *  *  *  ')).toMatchObject({ cadence: 'daily', hour: 9, minute: 0 })
  })
})
