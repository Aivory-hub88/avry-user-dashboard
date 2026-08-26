/**
 * Investment thresholds — the prescriptive half of the Financial Case.
 *
 * The report already tells a client THAT their stated budget is too large for
 * the savings they scoped. What it never told them is the number that would
 * fix it: how much investment still clears each financial test, or — holding
 * the budget fixed — how much annual saving the programme has to reach.
 * Without those two figures a negative NPV is a verdict; with them it is a
 * decision ("phase it at X, or widen scope until savings hit Y").
 *
 * Every threshold is stated against a STANDARD 3-year appraisal window, on
 * purpose: the client's question is "what gets me a return FASTER", so the
 * benchmark must stay fixed while the investment moves. This is independent
 * of the adaptive reporting window in lib/roiHorizon.ts (which follows the
 * case as it actually stands).
 *
 * Pure arithmetic, no rounding beyond presentation, and it reuses the exact
 * assumptions calculateROI() used (ongoing-cost rate, its start year and the
 * discount rate) rather than re-declaring them — so the thresholds can never
 * drift from the figures they are meant to fix.
 */

/** The window every threshold is appraised over. Fixed by design (see above). */
export const THRESHOLD_WINDOW_YEARS = 3
/** Payback target for the strictest test — the standard board-level hurdle. */
export const TARGET_PAYBACK_MONTHS = 24

export type ThresholdKey = 'payback' | 'roi' | 'npv'

export interface InvestmentThreshold {
  key: ThresholdKey
  /** Largest investment that still clears this test at today's savings. */
  maxInvestmentLocal: number | null
  /** Annual saving the programme must reach to clear it at the stated budget. */
  requiredAnnualSavingsLocal: number | null
  /** Whether the stated budget already clears it. */
  clearedToday: boolean | null
  /** How far the stated budget overshoots `maxInvestmentLocal` (0 when cleared). */
  investmentOvershootLocal: number | null
  /** Extra annual saving needed on top of today's (0 when cleared). */
  savingsShortfallLocal: number | null
}

interface ThresholdInputs {
  totalAnnualSavingsLocal?: number | null
  assumedBudgetMidpointLocal?: number | null
  ongoingCostRate?: number | null
  ongoingCostStartYear?: number | null
  discountRate?: number | null
}

/** Σ 1/(1+d)^t over [from..to]. */
function discountFactorSum(d: number, from: number, to: number): number {
  let sum = 0
  for (let t = from; t <= to; t++) sum += 1 / Math.pow(1 + d, t)
  return sum
}

/**
 * Solve each financial test for its investment ceiling and its savings floor.
 * Returns [] when savings or budget are missing — the report renders nothing
 * rather than a table of em-dashes.
 */
export function getInvestmentThresholds(calculations: ThresholdInputs | null | undefined): InvestmentThreshold[] {
  const S = calculations?.totalAnnualSavingsLocal
  const I = calculations?.assumedBudgetMidpointLocal
  if (typeof S !== 'number' || !isFinite(S) || S <= 0) return []
  if (typeof I !== 'number' || !isFinite(I) || I <= 0) return []

  const r = typeof calculations?.ongoingCostRate === 'number' ? calculations.ongoingCostRate : 0.12
  const startYear = typeof calculations?.ongoingCostStartYear === 'number' ? calculations.ongoingCostStartYear : 2
  const d = typeof calculations?.discountRate === 'number' ? calculations.discountRate : 0.10
  const W = THRESHOLD_WINDOW_YEARS

  // Years inside the window that carry the ongoing cost.
  const chargedYears = Math.max(0, W - (startYear - 1))
  const discountAll = discountFactorSum(d, 1, W)
  const discountCharged = startYear > W ? 0 : discountFactorSum(d, startYear, W)

  // 1. Payback ≤ 24 months (gross savings — the tile the report already shows).
  const paybackMax = S * (TARGET_PAYBACK_MONTHS / 12)
  const paybackNeed = I / (TARGET_PAYBACK_MONTHS / 12)

  // 2. Net ROI ≥ 0 within the window: S·W − r·I·chargedYears ≥ I.
  const roiMax = (S * W) / (1 + r * chargedYears)
  const roiNeed = (I * (1 + r * chargedYears)) / W

  // 3. NPV ≥ 0 within the window at the discount rate:
  //    S·Σall − r·I·Σcharged ≥ I.
  const npvMax = (S * discountAll) / (1 + r * discountCharged)
  const npvNeed = (I * (1 + r * discountCharged)) / discountAll

  const build = (key: ThresholdKey, maxInvestment: number, requiredSavings: number): InvestmentThreshold => ({
    key,
    maxInvestmentLocal: maxInvestment,
    requiredAnnualSavingsLocal: requiredSavings,
    clearedToday: I <= maxInvestment,
    investmentOvershootLocal: Math.max(0, I - maxInvestment),
    savingsShortfallLocal: Math.max(0, requiredSavings - S),
  })

  // Ordered strictest-first: clearing row 1 clears everything below it.
  return [
    build('payback', paybackMax, paybackNeed),
    build('npv', npvMax, npvNeed),
    build('roi', roiMax, roiNeed),
  ].sort((a, b) => (a.maxInvestmentLocal ?? 0) - (b.maxInvestmentLocal ?? 0))
}

export function thresholdTestLabel(key: ThresholdKey, locale: 'en' | 'id' = 'en'): string {
  if (locale === 'id') {
    return key === 'payback'
      ? `Payback ≤ ${TARGET_PAYBACK_MONTHS} bulan`
      : key === 'npv'
        ? `NPV positif dalam ${THRESHOLD_WINDOW_YEARS} tahun`
        : `ROI bersih positif dalam ${THRESHOLD_WINDOW_YEARS} tahun`
  }
  return key === 'payback'
    ? `Payback within ${TARGET_PAYBACK_MONTHS} months`
    : key === 'npv'
      ? `NPV positive within ${THRESHOLD_WINDOW_YEARS} years`
      : `Net ROI positive within ${THRESHOLD_WINDOW_YEARS} years`
}
