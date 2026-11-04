import { describe, it, expect } from 'vitest'
import { canTakeSeat, seatLimitFor } from './seats'

describe('seatLimitFor', () => {
  it('follows the published plans', () => {
    expect(seatLimitFor('operational', null)).toBe(1)
    expect(seatLimitFor('business', null)).toBe(5)
    expect(seatLimitFor('enterprise', null)).toBe(15)
  })
  it('reads pre-rebrand tier ids', () => {
    expect(seatLimitFor('foundation', null)).toBe(1)
    expect(seatLimitFor('pro', null)).toBe(5)
    expect(seatLimitFor('Intelligence', null)).toBe(15)
  })
  it('gives one seat without a live plan or on a one-time product', () => {
    expect(seatLimitFor(null, null)).toBe(1)
    expect(seatLimitFor('free', null)).toBe(1)
    expect(seatLimitFor('blueprint', null)).toBe(1)
  })
  it('honours a contract override', () => {
    expect(seatLimitFor('enterprise', 40)).toBe(40)
    expect(seatLimitFor('enterprise', 0)).toBe(15)
  })
  it('is unlimited for a platform admin owner', () => {
    expect(seatLimitFor('operational', null, 'superadmin')).toBeNull()
  })
})

describe('canTakeSeat', () => {
  it('refuses a new person once every seat is used', () => {
    expect(canTakeSeat({ used: 4, limit: 5 }, false)).toBe(true)
    expect(canTakeSeat({ used: 5, limit: 5 }, false)).toBe(false)
    expect(canTakeSeat({ used: 1, limit: 1 }, false)).toBe(false)
  })
  it('lets someone who already holds a seat in, even at or over the limit', () => {
    expect(canTakeSeat({ used: 5, limit: 5 }, true)).toBe(true)
    expect(canTakeSeat({ used: 7, limit: 5 }, true)).toBe(true)
  })
  it('never refuses when unlimited', () => {
    expect(canTakeSeat({ used: 500, limit: null }, false)).toBe(true)
  })
})
