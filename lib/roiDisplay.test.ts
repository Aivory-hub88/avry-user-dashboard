import { describe, it, expect, beforeEach } from 'vitest'
import { buildDiagnosticContext } from '@/services/deepDiagnostic'
import { formatRoi, ROI_DISPLAY_CAP } from './roiDisplay'
import { buildCapacityValueView } from './capacityValueView'

beforeEach(() => {
  ;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})

describe('formatRoi: no repeated ">999%"', () => {
  it('shows a normal percentage below the cap', () => {
    expect(formatRoi(497, 'en')).toBe('497%')
    expect(formatRoi(43.4, 'id')).toBe('43%')
    expect(formatRoi(0, 'en')).toBe('0%')
    expect(formatRoi(-30, 'en')).toBe('-30%')
  })

  it('says "Very high" at and past the cap instead of a capped number that carries no information', () => {
    expect(ROI_DISPLAY_CAP).toBe(999)
    expect(formatRoi(999, 'en')).toBe('Very high')
    expect(formatRoi(5000, 'en')).toBe('Very high')
    expect(formatRoi(999, 'id')).toBe('Sangat tinggi')
    expect(formatRoi(999, 'en')).not.toMatch(/999/)
  })

  it('missing values use the caller\'s placeholder, and a custom percent formatter is honoured', () => {
    expect(formatRoi(null, 'en')).toBe('N/A')
    expect(formatRoi(undefined, 'en', undefined, '—')).toBe('—')
    expect(formatRoi(NaN, 'en', undefined, '—')).toBe('—')
    expect(formatRoi(12.5, 'id', (n) => `${n.toFixed(1).replace('.', ',')}%`)).toBe('12,5%')
  })
})

describe('NPV per scenario leads the range; ROI is the companion', () => {
  const ctx = (extra: Record<string, unknown> = {}) => buildDiagnosticContext({
    currency: 'IDR — Indonesian Rupiah (Rp)', industry: 'Technology / Software', hourly_cost: 75000,
    manual_hours_per_person: '2-5 hours/person/week', fte_count: '6-15 FTEs', company_size: 'Micro (2–10 employees)',
    automation_current: '10-25%', target_automation: '50-75%',
    priority_areas: ['Operations and logistics', 'Customer service/support'],
    ...extra,
  } as any) as any

  it('conservative < base < optimistic, and base is the same NPV as the NPV tile', () => {
    const c = ctx().calculations
    const n = c.scenarioHorizonNPV
    expect(n.low).toBeLessThan(n.base)
    expect(n.base).toBeLessThan(n.high)
    expect(n.base).toBe(c.npvHorizonUSD)
    expect(c.scenarioHorizonNPVLocal.base).toBeCloseTo(c.npvHorizonLocal, 0)
  })

  it('the scenarios are informative where the ROI range is not: ROI saturates, NPV still separates them', () => {
    // a heavy per-person workload against a small counted investment: every ROI scenario hits the display cap
    const c = ctx({ manual_hours_per_person: 'Over 20 hours/person/week' }).calculations
    const roi = c.scenarioThreeYearROI
    // a small counted investment pushes every ROI scenario to the display cap...
    expect([roi.low, roi.base, roi.high].every((v: number) => v >= 999)).toBe(true)
    // ...while the NPV scenarios are still clearly different
    const n = c.scenarioHorizonNPVLocal
    expect(n.high - n.low).toBeGreaterThan(Math.abs(n.base) * 0.5)
  })

  it('local values are the USD values at the report FX rate', () => {
    const c = ctx().calculations
    for (const k of ['low', 'base', 'high']) {
      expect(c.scenarioHorizonNPVLocal[k]).toBeCloseTo(c.scenarioHorizonNPV[k] * c.fxRateUsed, 0)
    }
  })

  it('a running cost lowers every scenario NPV (the cash profile matches the ROI range)', () => {
    const soft = ctx({ operating_country: 'Indonesia', pain_points: 'sales outreach is manual; lead follow up in whatsapp; invoices' }).calculations
    const none = ctx().calculations
    expect(soft.requiredInvestment.softwareAnnualUSD).toBeGreaterThan(0)
    expect(soft.scenarioHorizonNPV.low).toBeLessThan(none.scenarioHorizonNPV.low)
    expect(soft.scenarioHorizonNPV.high).toBeLessThan(none.scenarioHorizonNPV.high)
  })
})

describe('the capacity-value line no longer prints a capped ROI', () => {
  it('says "Very high" instead of ">999%"', () => {
    const c = ctx2()
    const view = buildCapacityValueView({ ...c, horizonROIWithCapacityPercent: 1200, horizonROIPercent: 1000 } as never, (v: number) => String(Math.round(v)), 'en')
    const text = JSON.stringify(view)
    expect(text).not.toMatch(/>999/)
    expect(text).toMatch(/Very high \(without: Very high\)/)
  })
})

function ctx2() {
  return (buildDiagnosticContext({
    currency: 'IDR — Indonesian Rupiah (Rp)', industry: 'Technology / Software', hourly_cost: 75000,
    manual_hours_per_person: '2-5 hours/person/week', fte_count: '6-15 FTEs', company_size: 'Micro (2–10 employees)',
    automation_current: '10-25%', target_automation: '50-75%', volume_growth_12m: '50-75%',
    priority_areas: ['Operations and logistics'],
  } as any) as any).calculations
}
