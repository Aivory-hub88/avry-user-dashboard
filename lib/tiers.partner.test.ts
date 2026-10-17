import { describe, expect, it } from 'vitest'
import { canUseAivoryN8nInstance, isPaidTier, isSuperAdminAccount } from './tiers'

describe('distributor partner accounts', () => {
  it('cannot use the Aivory self-hosted n8n instance', () => {
    expect(canUseAivoryN8nInstance('partner')).toBe(false)
  })

  it('leaves the instance to superadmins only', () => {
    expect(canUseAivoryN8nInstance('superadmin')).toBe(true)
    for (const type of ['admin', 'employee', 'demo', 'paid', 'free', '', null, undefined]) {
      expect(canUseAivoryN8nInstance(type)).toBe(false)
    }
  })

  it('is not staff, so paid features come from its Enterprise tier', () => {
    expect(isSuperAdminAccount('partner')).toBe(false)
    expect(isPaidTier('enterprise')).toBe(true)
  })
})
