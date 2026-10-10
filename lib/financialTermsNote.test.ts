import { describe, it, expect } from 'vitest'
import { buildFinancialTermsNote } from './readinessNarrative'

describe('buildFinancialTermsNote', () => {
  it('on the required basis names the Aivory plan, not licenses sized off the budget', () => {
    const en = buildFinancialTermsNote('en', 3, { basis: 'required' })
    expect(en).toContain('the Aivory plan from year 2')
    expect(en).not.toContain('licenses')
    expect(en).not.toContain('capacity-value')
    expect(buildFinancialTermsNote('id', 3, { basis: 'required' })).toContain('plan Aivory mulai tahun ke-2')
  })
  it('explains the third ROI when the capacity block is shown', () => {
    expect(buildFinancialTermsNote('en', 3, { basis: 'required', hasCapacityRoi: true })).toContain('capacity-value block is a third figure')
    expect(buildFinancialTermsNote('id', 3, { basis: 'required', hasCapacityRoi: true })).toContain('blok nilai kapasitas adalah angka ketiga')
  })
  it('keeps the original wording for whole-budget reports', () => {
    expect(buildFinancialTermsNote('en', 7)).toContain('licenses, maintenance, support')
    expect(buildFinancialTermsNote('en', 7, { basis: 'stated_budget' })).toContain('licenses, maintenance, support')
  })
})
