import { describe, it, expect, beforeEach } from 'vitest'
import { netPaybackNotReachedLabel } from './resultFormatters'
import { isBandForCurrency, dropMismatchedBandAnswers } from './currencyBands'
import { buildDiagnosticContext } from '@/services/deepDiagnostic'

beforeEach(() => {
  ;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})

describe('netPaybackNotReachedLabel', () => {
  it('says "not reached" when savings and budget exist but net payback never happens', () => {
    const calc = { netPaybackMonths: null, totalAnnualSavingsLocal: 59_673_358, assumedBudgetMidpointLocal: 1_342_500_000 }
    expect(netPaybackNotReachedLabel(calc, 'en', 7)).toBe('Not reached in 7 yrs')
    expect(netPaybackNotReachedLabel(calc, 'id', 7)).toBe('Tidak tercapai dalam 7 tahun')
  })
  it('stays null when the figure exists or inputs are genuinely missing', () => {
    expect(netPaybackNotReachedLabel({ netPaybackMonths: 14, totalAnnualSavingsLocal: 1, assumedBudgetMidpointLocal: 1 })).toBeNull()
    expect(netPaybackNotReachedLabel({ netPaybackMonths: null, totalAnnualSavingsLocal: 100, assumedBudgetMidpointLocal: null })).toBeNull()
    expect(netPaybackNotReachedLabel({ netPaybackMonths: null, totalAnnualSavingsLocal: null, assumedBudgetMidpointLocal: 100 })).toBeNull()
  })
})

describe('currency band answers', () => {
  it('recognises a currency\'s own bands (EN stored and ID display labels)', () => {
    expect(isBandForCurrency('budget', 'IDR', 'Rp 100 – 500 juta')).toBe(true)
    expect(isBandForCurrency('budget', 'IDR', '$50K - $100K')).toBe(false)
    expect(isBandForCurrency('budget', 'USD', '$50K - $100K')).toBe(true)
  })

  it('drops a phase-3 dollar budget once the currency is IDR, keeps valid answers', () => {
    const phases = {
      business_objective_kpi: { completed: true, responses: { currency: 'IDR — Indonesian Rupiah (Rp)', annual_revenue: '$5M – $20M', industry: 'Logistics / Supply Chain' } },
      risk_constraints: { completed: true, responses: { budget_range: '$50K - $100K', risk_tolerance: 'Moderate - balanced approach' } },
    }
    const out = dropMismatchedBandAnswers(phases, 'IDR')
    expect(out.risk_constraints.responses.budget_range).toBeUndefined()
    expect(out.risk_constraints.responses.risk_tolerance).toBe('Moderate - balanced approach')
    expect(out.business_objective_kpi.responses.industry).toBe('Logistics / Supply Chain')
    // input untouched (pure)
    expect(phases.risk_constraints.responses.budget_range).toBe('$50K - $100K')
    // an IDR band survives
    const ok = dropMismatchedBandAnswers({ r: { responses: { budget_range: 'Rp 100 – 500 juta' } } }, 'IDR')
    expect(ok.r.responses.budget_range).toBe('Rp 100 – 500 juta')
  })
})

describe('budgetCurrencyMismatch flag on the report', () => {
  const base = {
    industry: 'Logistics / Supply Chain', manual_hours_weekly: '50-100 hours/week', fte_count: '16-50 FTEs',
    automation_current: '10-25%', target_automation: '50-75%',
  }
  it('is set for a dollar budget on an IDR report (the screenshot case)', () => {
    const c = buildDiagnosticContext({ ...base, currency: 'IDR — Indonesian Rupiah (Rp)', budget_range: '$50K - $100K' } as any)
    expect(c.qualitative.budgetCurrencyMismatch).toBe('$50K - $100K')
    expect(c.calculations.hoursReclaimedPerYear).toBe(1229)
  })
  it('is absent for an IDR band or a USD report', () => {
    expect(buildDiagnosticContext({ ...base, currency: 'IDR — Indonesian Rupiah (Rp)', budget_range: 'Rp 100 – 500 juta' } as any).qualitative.budgetCurrencyMismatch).toBeUndefined()
    expect(buildDiagnosticContext({ ...base, currency: 'USD — US Dollar ($)', budget_range: '$50k - $100k' } as any).qualitative.budgetCurrencyMismatch).toBeUndefined()
  })
})
