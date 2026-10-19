import { describe, expect, it } from 'vitest'
import { NOT_ACTIVATED_LABEL, accountTypeLabel, isActivated, planLabel } from './tiers'

describe('plan labels — there is no free plan', () => {
  it('never shows "Free" for an account without a live plan', () => {
    for (const tier of ['free', '', null, undefined, 'unknown']) {
      expect(planLabel(tier, 'free')).toBe(NOT_ACTIVATED_LABEL)
      expect(planLabel(tier, 'paid')).toBe(NOT_ACTIVATED_LABEL)
      expect(isActivated(tier, 'paid')).toBe(false)
    }
  })

  it('names live subscriptions, including pre-rebrand aliases', () => {
    expect(planLabel('operational', 'paid')).toBe('Operational')
    expect(planLabel('pro', 'paid')).toBe('Business')
    expect(planLabel('enterprise', 'paid')).toBe('Enterprise')
  })

  it('names one-time purchases', () => {
    expect(planLabel('snapshot', 'paid')).toBe('Assessment')
    expect(planLabel('blueprint', 'paid')).toBe('Blueprint')
  })

  it('shows partners as Partner while active and Not activated after the free period', () => {
    expect(planLabel('enterprise', 'partner')).toBe('Partner')
    expect(planLabel('free', 'partner')).toBe(NOT_ACTIVATED_LABEL)
  })

  it('staff and demo accounts are always activated', () => {
    expect(planLabel('free', 'superadmin')).toBe('Admin')
    expect(planLabel('free', 'demo')).toBe('Demo')
    expect(isActivated('free', 'admin')).toBe(true)
  })

  it('internal account types read as Customer', () => {
    for (const t of ['free', 'paid', 'user', null]) expect(accountTypeLabel(t)).toBe('Customer')
    expect(accountTypeLabel('partner')).toBe('Partner')
  })
})
