/**
 * Does this report count a recurring (running) cost in its figures?
 *
 * Reports computed since 2026-11-06 do not: the Financial Case covers the one-time
 * package and setup only, and the Aivory plan is a separate recommendation, so
 * Payback, ROI and NPV all sit on one basis. Reports stored earlier still carry the
 * plan as a running cost, and the stated-budget basis still has its own, so views
 * that talk about running costs, net savings or "before/after running costs" key off
 * this instead of assuming.
 */
export function hasRunningCost(calc: { annualOngoingCostUSD?: number | null; annualOngoingCostLocal?: number | null } | null | undefined): boolean {
  const v = typeof calc?.annualOngoingCostUSD === 'number' ? calc.annualOngoingCostUSD
    : typeof calc?.annualOngoingCostLocal === 'number' ? calc.annualOngoingCostLocal
    : 0
  return v > 0
}

/** PDF/metric-grid labels of the tiles that only make sense when there is a running cost. */
export const RUNNING_COST_TILE_LABELS: readonly string[] = [
  'Annual Ongoing Cost', 'Net Annual Savings', 'Net Payback',
  'Biaya Berjalan Tahunan', 'Penghematan Bersih Tahunan', 'Payback Bersih',
]
