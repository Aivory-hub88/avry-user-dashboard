import { describe, it, expect } from 'vitest'
import { buildNetVerdict } from './netVerdict'

const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString('en-US')}`
// the case from the report: value 17.46M vs plan 21.51M, 166 h recovered
const LOSS = { totalAnnualSavingsLocal: 17_463_665, annualOngoingCostLocal: 21_510_762, netAnnualSavingsLocal: -4_047_097, hoursReclaimedPerYear: 166 }

describe('buildNetVerdict', () => {
  it('explains a net-negative case with the hours needed to break even', () => {
    const t = buildNetVerdict(LOSS, 'en', fmt)!
    expect(t).toMatch(/does not cover its own running cost/)
    expect(t).toMatch(/Rp 4,047,097 short/)
    expect(t).toMatch(/about 205 recovered hours per year \(this scope recovers 166\)/)
    expect(t).toMatch(/before running costs/)
  })
  it('names the plan so the cost is not a mystery line', () => {
    const t = buildNetVerdict({ ...LOSS, planName: 'Business' }, 'en', fmt)!
    expect(t).toMatch(/Aivory Business plan costs/)
    expect(t).toMatch(/explained in the investment section above/)
    expect(buildNetVerdict({ ...LOSS, planName: 'Business' }, 'id', fmt)!).toMatch(/plan Aivory Business memakan/)
  })
  it('is localized', () => {
    expect(buildNetVerdict(LOSS, 'id', fmt)!).toMatch(/belum menutup biayanya sendiri/)
  })
  it('is silent when the case pays for itself or inputs are missing', () => {
    expect(buildNetVerdict({ ...LOSS, netAnnualSavingsLocal: 1_000_000 }, 'en', fmt)).toBeNull()
    expect(buildNetVerdict({ ...LOSS, annualOngoingCostLocal: null }, 'en', fmt)).toBeNull()
    expect(buildNetVerdict(null, 'en', fmt)).toBeNull()
  })
})
