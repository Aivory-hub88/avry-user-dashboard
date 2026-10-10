/**
 * Stated budget vs. recommended investment — the side-by-side that explains a
 * negative Financial Case instead of just showing it.
 *
 * A report whose stated budget dwarfs the savings it scoped shows red tiles
 * (negative ROI/NPV/net savings) that readers took for a calculation error.
 * This lays the same metrics out for two investments over the SAME window:
 *   - the budget the user entered (what the tiles already show), and
 *   - the recommended investment: the largest outlay that still pays back
 *     within 24 months at today's savings (= 2 × annual savings, the
 *     report's existing "Break-even Investment" figure).
 *
 * Pure arithmetic over fields calculateROI() already stored, reusing its own
 * ongoing-cost rate, start year and discount rate — so the "Your budget"
 * column reproduces the tiles exactly and the two columns can't drift apart.
 */

export const RECOMMENDED_PAYBACK_MONTHS = 24

export interface InvestmentScenario {
  investmentLocal: number
  paybackMonths: number
  annualOngoingCostLocal: number
  netAnnualSavingsLocal: number
  /** null when net savings never recover the investment. */
  netPaybackMonths: number | null
  /** Gross ROI over the window — same definition as the report's ROI tile. */
  roiPercent: number
  npvLocal: number
}

export interface InvestmentComparison {
  horizonYears: number
  annualSavingsLocal: number
  stated: InvestmentScenario
  recommended: InvestmentScenario
}

interface ComparisonInputs {
  totalAnnualSavingsLocal?: number | null
  assumedBudgetMidpointLocal?: number | null
  ongoingCostRate?: number | null
  ongoingCostStartYear?: number | null
  discountRate?: number | null
  hasEnoughDataForProjection?: boolean
}

export function scenarioAt(
  investment: number,
  savings: number,
  horizonYears: number,
  rate = 0.12,
  startYear = 2,
  discount = 0.10,
): InvestmentScenario {
  const ongoing = investment * rate
  const net = savings - ongoing
  const netBreakEvenYears =
    savings >= investment ? investment / savings
    : net > 0 ? 1 + (investment - savings) / net
    : null
  let npv = -investment
  for (let t = 1; t <= horizonYears; t++) {
    npv += (t < startYear ? savings : net) / Math.pow(1 + discount, t)
  }
  return {
    investmentLocal: investment,
    paybackMonths: (investment / savings) * 12,
    annualOngoingCostLocal: ongoing,
    netAnnualSavingsLocal: net,
    netPaybackMonths: netBreakEvenYears !== null ? netBreakEvenYears * 12 : null,
    roiPercent: Math.min(((savings * horizonYears - investment) / investment) * 100, 999),
    npvLocal: npv,
  }
}

/**
 * Returns null when there is nothing to compare: missing savings/budget, or
 * the stated budget already pays back within 24 months (the case is healthy
 * and the tiles speak for themselves).
 */
export function buildInvestmentComparison(
  calc: ComparisonInputs | null | undefined,
  horizonYears: number,
): InvestmentComparison | null {
  if (!calc || calc.hasEnoughDataForProjection === false) return null
  const S = calc.totalAnnualSavingsLocal
  const B = calc.assumedBudgetMidpointLocal
  if (typeof S !== 'number' || !isFinite(S) || S <= 0) return null
  if (typeof B !== 'number' || !isFinite(B) || B <= 0) return null
  const recommendedInvestment = S * (RECOMMENDED_PAYBACK_MONTHS / 12)
  if (B <= recommendedInvestment) return null

  const rate = typeof calc.ongoingCostRate === 'number' ? calc.ongoingCostRate : 0.12
  const start = typeof calc.ongoingCostStartYear === 'number' ? calc.ongoingCostStartYear : 2
  const d = typeof calc.discountRate === 'number' ? calc.discountRate : 0.10
  return {
    horizonYears,
    annualSavingsLocal: S,
    stated: scenarioAt(B, S, horizonYears, rate, start, d),
    recommended: scenarioAt(recommendedInvestment, S, horizonYears, rate, start, d),
  }
}

/** One plain-language sentence explaining why the stated case is negative. */
export function investmentComparisonExplanation(
  c: InvestmentComparison,
  fmt: (v: number) => string,
  locale: 'en' | 'id' = 'en',
): string {
  const ratio = c.stated.investmentLocal / c.annualSavingsLocal
  const ratioStr = locale === 'id' ? ratio.toFixed(1).replace('.', ',') : ratio.toFixed(1)
  const runCostExceeds = c.stated.annualOngoingCostLocal >= c.annualSavingsLocal
  if (locale === 'id') {
    return `Penghematan yang diproyeksikan ${fmt(c.annualSavingsLocal)}/tahun, sedangkan anggaran yang Anda masukkan ${fmt(c.stated.investmentLocal)} — ${ratioStr}× penghematan tahunan` +
      (runCostExceeds
        ? `, dan biaya berjalannya (${fmt(c.stated.annualOngoingCostLocal)}/tahun) bahkan lebih besar dari penghematan itu sendiri.`
        : '.') +
      ` Angka negatif ini benar secara hitungan, bukan error: investasinya terlalu besar untuk skala otomasi yang dinilai. Dengan investasi yang sebanding — maksimal ${fmt(c.recommended.investmentLocal)}, balik modal ≤ ${RECOMMENDED_PAYBACK_MONTHS} bulan — semua angka menjadi positif:`
  }
  return `Projected savings are ${fmt(c.annualSavingsLocal)}/yr, while the budget you entered is ${fmt(c.stated.investmentLocal)} — ${ratioStr}× the annual savings` +
    (runCostExceeds
      ? `, and its running cost (${fmt(c.stated.annualOngoingCostLocal)}/yr) is larger than the savings themselves.`
      : '.') +
    ` The negative figures are correct arithmetic, not an error: the investment is too large for the scale of automation assessed. At a proportionate investment — up to ${fmt(c.recommended.investmentLocal)}, paying back within ${RECOMMENDED_PAYBACK_MONTHS} months — every figure turns positive:`
}
