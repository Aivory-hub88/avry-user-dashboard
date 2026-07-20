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
import { calculateROI } from './deepDiagnostic'
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
