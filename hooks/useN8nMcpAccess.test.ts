import { describe, it, expect } from 'vitest'
import { hasUsableCredits } from './useN8nMcpAccess'

const base = { unlimited: false, tier: 'free', balance: 0, allowance: 0 }

describe('hasUsableCredits', () => {
  it('unlimited accounts pass regardless of balance', () => {
    expect(hasUsableCredits({ ...base, unlimited: true, balance: null })).toBe(true)
  })
  it('positive balance passes (top-up buyers without a plan included)', () => {
    expect(hasUsableCredits({ ...base, tier: 'free', balance: 40 })).toBe(true)
  })
  it('zero balance fails, even on a paid tier — tier is not the gate', () => {
    expect(hasUsableCredits({ ...base, tier: 'business', balance: 0 })).toBe(false)
  })
  it('falls back to monthly + extra when balance is missing', () => {
    expect(hasUsableCredits({ ...base, balance: null, monthly_balance: 0, extra_balance: 5 })).toBe(true)
    expect(hasUsableCredits({ ...base, balance: null, monthly_balance: 0, extra_balance: 0 })).toBe(false)
  })
  it('null status fails', () => {
    expect(hasUsableCredits(null)).toBe(false)
  })
})
