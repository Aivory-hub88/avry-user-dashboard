/**
 * B1.5 — Financial math reconciliation (revision-guideline addendum, P0).
 *
 * Proves the numbers rendered in the Financial Case cards reconcile with the
 * formulas the report prints on its own Methodology page — from ONE source of
 * truth (calculateROI), across several input combinations. If any of these
 * assertions fail, a card and its stated formula have drifted apart, which is
 * the credibility-killing class of bug the addendum flags.
 *
 * NOTE ON THE SAMPLE THAT TRIGGERED THIS: the "Acme Logistics" sample showing
 * 3-Year ROI 240% next to a formula that yields 303% was generated from the
 * hand-authored §9 seed fixture, whose `calculations` block was typed in and
 * is NOT internally consistent (threeYearROIPercent 240 doesn't equal
 * (84000×3−62500)/62500 = 303, and hoursReclaimed 2300 doesn't equal any
 * weeklyHours×52×gap×0.75). The engine itself computes every field together
 * and reconciles exactly — that is what this test locks in.
 */
import { describe, it, expect } from 'vitest'
import { calculateROI, dampConfidenceByEstimateBasis, parseBudgetMidpointUSD } from './deepDiagnostic'
import { getLabourBenchmark } from '@/lib/currencyBands'
import type { DiagnosticContext } from '@/types/diagnostic'

type Q = DiagnosticContext['quantitative']

function q(partial: Partial<Q>): Q {
  return {
    ticketVolumePerDay: null,
    ahtCurrentMinutes: null,
    ahtTargetMinutes: null,
    costCurrentPerTicket: null,
    costTargetPerTicket: null,
    totalManualHoursWeekly: null,
    fteCountInScope: null,
    currentAutomationPct: null,
    targetAutomationPct: null,
    budgetMidpointUSD: null,
    timelineMonths: null,
    ...partial,
  }
}

// Five deliberately different input combinations (varying manual hours,
// automation gap, budget, team size).
const CASES: Array<{ name: string; q: Q }> = [
  { name: 'micro team, small budget', q: q({ totalManualHoursWeekly: 20, fteCountInScope: 3, currentAutomationPct: 10, targetAutomationPct: 60, budgetMidpointUSD: 15000 }) },
  { name: 'mid team, mid budget', q: q({ totalManualHoursWeekly: 44, fteCountInScope: 12, currentAutomationPct: 20, targetAutomationPct: 70, budgetMidpointUSD: 62500 }) },
  { name: 'large team, large budget', q: q({ totalManualHoursWeekly: 120, fteCountInScope: 40, currentAutomationPct: 15, targetAutomationPct: 90, budgetMidpointUSD: 250000 }) },
  { name: 'high hours, tiny gap', q: q({ totalManualHoursWeekly: 80, fteCountInScope: 8, currentAutomationPct: 55, targetAutomationPct: 65, budgetMidpointUSD: 40000 }) },
  { name: 'solo, high automation target', q: q({ totalManualHoursWeekly: 15, fteCountInScope: 1, currentAutomationPct: 5, targetAutomationPct: 85, budgetMidpointUSD: 8000 }) },
]

describe('calculateROI — card ↔ methodology reconciliation (USD, rate = 1)', () => {
  for (const c of CASES) {
    describe(c.name, () => {
      const r = calculateROI(c.q, 'USD')

      it('recovered capacity = round(weeklyHours × 52 × automation gap × 0.75)', () => {
        const gap = Math.max(0, Math.min((c.q.targetAutomationPct! - c.q.currentAutomationPct!) / 100, 1))
        const expected = Math.round(c.q.totalManualHoursWeekly! * 52 * gap * 0.75)
        expect(r.hoursReclaimedPerYear).toBe(expected)
      })

      it('total savings = labor + 20% process overhead', () => {
        expect(r.annualProcessSavingsLocal).toBeCloseTo((r.annualLaborSavingsLocal ?? 0) * 0.2, 2)
        expect(r.totalAnnualSavingsLocal).toBeCloseTo((r.annualLaborSavingsLocal ?? 0) + (r.annualProcessSavingsLocal ?? 0), 2)
      })

      it('payback (months) = budget ÷ savings/yr × 12 — the printed Step-5 formula', () => {
        const expected = (r.assumedBudgetMidpointUSD! / r.totalAnnualSavingsUSD!) * 12
        expect(r.paybackMonths).toBeCloseTo(expected, 4)
      })

      it('3-Year ROI card = its printed Step-6 formula (savings×3 − budget) ÷ budget × 100, capped 999', () => {
        const raw = ((r.totalAnnualSavingsUSD! * 3 - r.assumedBudgetMidpointUSD!) / r.assumedBudgetMidpointUSD!) * 100
        expect(r.threeYearROIPercent).toBeCloseTo(Math.min(raw, 999), 4)
      })
    })
  }
})

describe('calculateROI — methodology reconciles in the displayed (local) currency too', () => {
  // The Methodology page prints the ROI formula with the *Local values shown on
  // the cards; the ×rate factor must cancel so the local-currency formula
  // yields the same percentage as the USD-computed threeYearROIPercent.
  for (const code of ['IDR', 'EUR', 'SGD'] as const) {
    it(`3-Year ROI is rate-invariant (${code})`, () => {
      const r = calculateROI(CASES[1].q, code)
      if (r.totalAnnualSavingsLocal == null || r.assumedBudgetMidpointLocal == null) return
      const localFormula = ((r.totalAnnualSavingsLocal * 3 - r.assumedBudgetMidpointLocal) / r.assumedBudgetMidpointLocal) * 100
      expect(Math.min(localFormula, 999)).toBeCloseTo(r.threeYearROIPercent!, 4)
    })
  }
})

describe('D2 — dampConfidenceByEstimateBasis (confidence-source signal)', () => {
  it('formal time-tracking is neutral — never changes the base confidence', () => {
    expect(dampConfidenceByEstimateBasis('high', 'Formal time-tracking system')).toBe('high')
    expect(dampConfidenceByEstimateBasis('medium', 'Formal time-tracking system')).toBe('medium')
    expect(dampConfidenceByEstimateBasis('low', 'Formal time-tracking system')).toBe('low')
  })

  it('informal tracking caps at medium (only lowers, never raises)', () => {
    expect(dampConfidenceByEstimateBasis('high', 'Informal tracking (notes, spreadsheets)')).toBe('medium')
    expect(dampConfidenceByEstimateBasis('medium', 'Informal tracking (notes, spreadsheets)')).toBe('medium')
    expect(dampConfidenceByEstimateBasis('low', 'Informal tracking (notes, spreadsheets)')).toBe('low')
  })

  it('gut-feel caps at low', () => {
    expect(dampConfidenceByEstimateBasis('high', 'Rough estimate / gut feel')).toBe('low')
    expect(dampConfidenceByEstimateBasis('medium', 'Rough estimate / gut feel')).toBe('low')
    expect(dampConfidenceByEstimateBasis('low', 'Rough estimate / gut feel')).toBe('low')
  })

  it('absent / empty / unrecognized answers are a no-op (back-compat invariant)', () => {
    for (const base of ['low', 'medium', 'high'] as const) {
      expect(dampConfidenceByEstimateBasis(base, undefined)).toBe(base)
      expect(dampConfidenceByEstimateBasis(base, null)).toBe(base)
      expect(dampConfidenceByEstimateBasis(base, '')).toBe(base)
      expect(dampConfidenceByEstimateBasis(base, 'something else entirely')).toBe(base)
    }
  })

  it('does not alter any figure — full ROI object is unchanged apart from the label', () => {
    const base = calculateROI(CASES[1].q, 'USD')
    const damped = { ...base, confidenceLevel: dampConfidenceByEstimateBasis(base.confidenceLevel, 'Rough estimate / gut feel') }
    expect(damped.totalAnnualSavingsUSD).toBe(base.totalAnnualSavingsUSD)
    expect(damped.hoursReclaimedPerYear).toBe(base.hoursReclaimedPerYear)
    expect(damped.paybackMonths).toBe(base.paybackMonths)
    expect(damped.threeYearROIPercent).toBe(base.threeYearROIPercent)
    expect(damped.confidenceLevel).toBe('low')
  })
})

describe('parseBudgetMidpointUSD — EN and ID option labels must resolve to the same midpoint', () => {
  const PAIRS: Array<[string, string, number]> = [
    ['Under $10k', 'Di bawah $10K', 5_000],
    ['$10k - $50k', '$10K - $50K', 30_000],
    ['$50k - $100k', '$50K - $100K', 75_000],
    ['$100k - $500k', '$100K - $500K', 300_000],
    ['Over $500k', 'Di atas $500K', 750_000],
  ]

  for (const [en, id, expected] of PAIRS) {
    it(`"${en}" and "${id}" both resolve to ${expected}`, () => {
      expect(parseBudgetMidpointUSD(en)).toBe(expected)
      expect(parseBudgetMidpointUSD(id)).toBe(expected)
    })
  }

  it('"Tidak berlaku" / "Not applicable" (no $Nk figure) is null, not a crash', () => {
    expect(parseBudgetMidpointUSD('Tidak berlaku')).toBeNull()
    expect(parseBudgetMidpointUSD(undefined)).toBeNull()
  })
})

describe('parseBudgetMidpointUSD — currency-aware band tables (2026-08-25)', () => {
  it('IDR juta/miliar bands resolve to USD midpoints (EN canonical + ID display)', () => {
    expect(parseBudgetMidpointUSD('Under Rp 100 juta', 'IDR')).toBe(3_125)
    expect(parseBudgetMidpointUSD('Di bawah Rp 100 juta', 'IDR')).toBe(3_125)
    expect(parseBudgetMidpointUSD('Rp 100 – 500 juta', 'IDR')).toBe(18_750)
    expect(parseBudgetMidpointUSD('Rp 500 juta – Rp 1 miliar', 'IDR')).toBe(46_875)
    expect(parseBudgetMidpointUSD('Rp 1 – 10 miliar', 'IDR')).toBe(343_750)
    expect(parseBudgetMidpointUSD('Rp 10 – 100 miliar', 'IDR')).toBe(3_437_500)
    expect(parseBudgetMidpointUSD('Di atas Rp 100 miliar', 'IDR')).toBe(9_375_000)
  })

  it('AED / SAR / OMR bands resolve to USD midpoints in both labels', () => {
    expect(parseBudgetMidpointUSD('AED 25,000 – 100,000', 'AED')).toBe(17_000)
    expect(parseBudgetMidpointUSD('AED 25.000 – 100.000', 'AED')).toBe(17_000)
    expect(parseBudgetMidpointUSD('SAR 250,000 – 1,000,000', 'SAR')).toBe(166_667)
    expect(parseBudgetMidpointUSD('OMR 2,500 – 10,000', 'OMR')).toBe(16_250)
    expect(parseBudgetMidpointUSD('Di bawah OMR 2.500', 'OMR')).toBe(3_250)
  })

  it('"Tidak berlaku" band resolves to null in every new currency (no legacy fallthrough)', () => {
    expect(parseBudgetMidpointUSD('Tidak berlaku', 'IDR')).toBeNull()
    expect(parseBudgetMidpointUSD('Not applicable', 'AED')).toBeNull()
    expect(parseBudgetMidpointUSD('Tidak berlaku', 'SAR')).toBeNull()
    expect(parseBudgetMidpointUSD('Tidak berlaku', 'OMR')).toBeNull()
  })

  it('legacy $Nk answers still parse when the band table misses (old saved answers)', () => {
    expect(parseBudgetMidpointUSD('$10k - $50k', 'IDR')).toBe(30_000)
    expect(parseBudgetMidpointUSD('Di bawah $10K', 'AED')).toBe(5_000)
  })

  it('unrecognised free text stays null (no invented midpoints)', () => {
    expect(parseBudgetMidpointUSD('anggaran saya rahasia', 'IDR')).toBeNull()
  })
})

describe('per-country labour benchmarks (currency → wage anchor state machine)', () => {
  it('every anchored currency reports its country benchmark label', () => {
    for (const code of ['IDR', 'EUR', 'AED', 'SAR', 'OMR'] as const) {
      expect(getLabourBenchmark(code)).not.toBeNull()
    }
    expect(getLabourBenchmark('USD')).toBeNull() // US industry table path
  })

  it('AED anchor ≈ AED 5.000/month ÷ 173 hrs, SAR ≈ SAR 4.000, OMR ≈ OMR 325', () => {
    expect(getLabourBenchmark('AED')!.monthlyAnchorLocal).toBe(5_000)
    expect(getLabourBenchmark('SAR')!.monthlyAnchorLocal).toBe(4_000)
    expect(getLabourBenchmark('OMR')!.monthlyAnchorLocal).toBe(325)
    expect(getLabourBenchmark('AED')!.hourlyLocal).toBeCloseTo(28.9, 1)
    expect(getLabourBenchmark('OMR')!.hourlyLocal).toBeCloseTo(1.88, 2)
  })

  it('3-Year ROI is rate-invariant in the new currencies too', () => {
    for (const code of ['AED', 'SAR', 'OMR'] as const) {
      const r = calculateROI(CASES[1].q, code)
      if (r.totalAnnualSavingsLocal == null || r.assumedBudgetMidpointLocal == null) return
      const localFormula = ((r.totalAnnualSavingsLocal * 3 - r.assumedBudgetMidpointLocal) / r.assumedBudgetMidpointLocal) * 100
      expect(Math.min(localFormula, 999)).toBeCloseTo(r.threeYearROIPercent!, 4)
    }
  })
})
