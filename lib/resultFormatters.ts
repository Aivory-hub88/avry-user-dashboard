/**
 * Pure formatting helpers for the Deep Diagnostic Result Page.
 * All functions are null-safe and never throw — invalid inputs return "—".
 */

import type { OpportunityQuadrant } from '@/types/diagnostic'

// ────────────────────────────────────────────
//  CURRENCY CONFIG
// ────────────────────────────────────────────

export type CurrencyCode =
  | 'USD' | 'EUR' | 'GBP' | 'IDR'
  | 'SGD' | 'MYR' | 'AUD' | 'JPY' | 'INR'

interface CurrencyConfig {
  symbol: string
  /** Thousands separator */
  thousands: string
  rateFromUSD: number
}

const CURRENCY_MAP: Record<CurrencyCode, CurrencyConfig> = {
  USD: { symbol: '$',   thousands: ',', rateFromUSD: 1 },
  EUR: { symbol: '€',   thousands: '.', rateFromUSD: 0.92 },
  GBP: { symbol: '£',   thousands: ',', rateFromUSD: 0.79 },
  IDR: { symbol: 'Rp ', thousands: '.', rateFromUSD: 15_600 },
  SGD: { symbol: 'S$',  thousands: ',', rateFromUSD: 1.35 },
  MYR: { symbol: 'RM',  thousands: ',', rateFromUSD: 4.72 },
  AUD: { symbol: 'A$',  thousands: ',', rateFromUSD: 1.53 },
  JPY: { symbol: '¥',   thousands: ',', rateFromUSD: 149 },
  INR: { symbol: '₹',   thousands: ',', rateFromUSD: 83 },
}

/**
 * Parse the currency answer string (e.g. "IDR — Indonesian Rupiah (Rp)")
 * into a CurrencyCode.  Falls back to 'USD' if unrecognised.
 */
export function parseCurrencyCode(answer: string | undefined): CurrencyCode {
  if (!answer) return 'USD'
  const code = answer.split(' ')[0].toUpperCase() as CurrencyCode
  return code in CURRENCY_MAP ? code : 'USD'
}

/**
 * Format a USD value into the target currency.
 * e.g. formatCurrency(1000, 'IDR') → "Rp 15.600.000"
 */
export function formatCurrency(
  valueUSD: number | null | undefined,
  currency: CurrencyCode = 'USD',
): string {
  if (valueUSD === null || valueUSD === undefined || !isFinite(valueUSD) || isNaN(valueUSD)) {
    return '—'
  }
  const cfg = CURRENCY_MAP[currency] ?? CURRENCY_MAP.USD
  const converted = Math.round(valueUSD * cfg.rateFromUSD)
  const formatted = converted.toString().replace(/\B(?=(\d{3})+(?!\d))/g, cfg.thousands)
  return `${cfg.symbol}${formatted}`
}

/**
 * BUG 1 FIX — Format a value in IDR using the shared CURRENCY_MAP
 * instead of a hardcoded formatter.  This delegates to formatCurrency()
 * so the thousands-separator logic is consistent everywhere.
 * Signature is kept as `(value) => string` for callers that already
 * import `formatIDR` (e.g. final-result/page.tsx).
 */
export function formatIDR(value: number | null | undefined): string {
  return formatCurrency(value, 'IDR')
}

/**
 * Format a number as USD: "$1,234,567"
 */
export function formatUSD(value: number | null | undefined): string {
  return formatCurrency(value, 'USD')
}

// ────────────────────────────────────────────
//  LABOUR-RATE LOOKUP  —  Bug 2 fix
// ────────────────────────────────────────────

/**
 * Industry codes used in the diagnostic question "What industry are you in?"
 *
 * The lookup key is normalised from the raw answer (e.g. "Technology / Software"
 * becomes "technology-software").
 */
export type IndustryCode =
  | 'technology-software'
  | 'finance-banking'
  | 'healthcare'
  | 'retail-ecommerce'
  | 'manufacturing'
  | 'other'

/**
 * Average hourly labour cost (fully loaded) by industry in USD.
 *
 * Source: Bureau of Labor Statistics (US) / internal estimates 2025-2026.
 * Used to compute labour-savings in the deep diagnostic ROI projection.
 */
export const INDUSTRY_HOURLY_RATES: Record<IndustryCode, number> = {
  'technology-software': 65,
  'finance-banking':     60,
  'healthcare':          50,
  'retail-ecommerce':    30,
  'manufacturing':       25,
  'other':               30,
}

/**
 * Normalise an answer string from the industry question into an IndustryCode.
 *
 * Accepts raw labels like "Technology / Software", "Finance / Banking",
 * "Healthcare", etc.  Falls back to "other" if unrecognised.
 */
export function parseIndustryCode(answer: string | undefined): IndustryCode {
  if (!answer) return 'other'
  const normalised = answer
    .toLowerCase()
    .replace(/\s*\/\s*/g, '-')   // "Technology / Software" → "technology-software"
    .replace(/[^a-z0-9-]/g, '')
  return normalised in INDUSTRY_HOURLY_RATES
    ? (normalised as IndustryCode)
    : 'other'
}

/**
 * Get the hourly labour rate (fully loaded) for a given industry.
 * Falls back to the "other" rate when the code is unrecognised.
 */
export function getIndustryHourlyRate(industry: IndustryCode): number {
  return INDUSTRY_HOURLY_RATES[industry] ?? INDUSTRY_HOURLY_RATES.other
}

// ────────────────────────────────────────────
//  RISK DETECTION RULES  —  Bug 3
// ────────────────────────────────────────────

export interface Risk {
  id: string
  title: string
  description: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  category: 'financial' | 'operational' | 'strategic'
  order: number
}

export interface RiskDetectionInput {
  /** HR-relevant: percentage of tasks that are manual / automatable */
  automationGapPct?: number

  /** Budget ambition gap: budget for next 12 months (USD) vs high-level ambition score (0–100) */
  annualBudgetUSD?: number
  ambitionScore?: number

  /** Single-point-of-failure: number of people who "know how things work" */
  singlePointCount?: number

  /** Pre-revenue cash constraint: months of runway remaining */
  runwayMonths?: number
  monthlyBurnUSD?: number

  /** Number of employees */
  employeeCount?: number
}

/**
 * Evaluate all risk-detection rules and return any risks that trigger.
 *
 * Each rule produces at most one Risk.  Invalid / missing inputs silently
 * produce no risk for that rule.
 */
export function detectRisks(input: RiskDetectionInput): Risk[] {
  const risks: Risk[] = []
  let seq = 0

  // ── 1. Budget–Ambition Gap ─────────────────────────────────────
  if (
    input.annualBudgetUSD !== undefined &&
    input.ambitionScore !== undefined &&
    isFinite(input.annualBudgetUSD) &&
    isFinite(input.ambitionScore)
  ) {
    // Very rough heuristic:  ambitionScore / 100 ≈ desired maturity level
    // A budget < $10k per point of ambition signals a gap.
    const budgetPerAmbitionPoint = input.annualBudgetUSD / Math.max(input.ambitionScore, 1)
    if (budgetPerAmbitionPoint < 10_000) {
      seq++
      risks.push({
        id: `risk-budget-ambition-gap`,
        title: 'Budget–Ambition Gap',
        description:
          `Your stated ambition level (${input.ambitionScore}/100) significantly ` +
          `outpaces the annual budget ($${(input.annualBudgetUSD / 1_000).toFixed(0)}k). ` +
          `This imbalance can stall initiatives and erode team confidence.`,
        severity: 'HIGH',
        category: 'financial',
        order: seq,
      })
    }
  }

  // ── 2. Single-Point-of-Failure ────────────────────────────────
  if (
    input.singlePointCount !== undefined &&
    input.employeeCount !== undefined &&
    isFinite(input.singlePointCount) &&
    isFinite(input.employeeCount) &&
    input.employeeCount > 0
  ) {
    const ratio = input.singlePointCount / input.employeeCount
    if (ratio > 0.3) {
      seq++
      risks.push({
        id: `risk-single-point-failure`,
        title: 'Single-Point-of-Failure',
        description:
          `${input.singlePointCount} out of ${input.employeeCount} employees ` +
          `are the sole knowledge-holders for critical processes. ` +
          `Losing even one would cause major disruption.`,
        severity: ratio > 0.5 ? 'HIGH' : 'MEDIUM',
        category: 'operational',
        order: seq,
      })
    }
  }

  // ── 3. Pre-Revenue Cash Constraint ────────────────────────────
  if (
    input.runwayMonths !== undefined &&
    isFinite(input.runwayMonths)
  ) {
    if (input.runwayMonths <= 6) {
      seq++
      risks.push({
        id: `risk-cash-constraint`,
        title: 'Pre-Revenue Cash Constraint',
        description:
          `With only ${input.runwayMonths} month${input.runwayMonths === 1 ? '' : 's'} of runway, ` +
          `any automation project must deliver payback within ${Math.floor(input.runwayMonths / 2)} months ` +
          `to avoid straining cash reserves.`,
        severity: input.runwayMonths <= 3 ? 'HIGH' : 'MEDIUM',
        category: 'financial',
        order: seq,
      })
    }
  }

  // ── 4. Large Automation Gap ───────────────────────────────────
  if (
    input.automationGapPct !== undefined &&
    isFinite(input.automationGapPct)
  ) {
    if (input.automationGapPct > 40) {
      seq++
      risks.push({
        id: `risk-automation-gap`,
        title: 'Large Automation Gap',
        description:
          `${input.automationGapPct.toFixed(0)}% of tasks are currently manual. ` +
          `Such a wide automation gap often indicates fragmented tooling and ` +
          ` ad-hoc processes that resist incremental improvement.`,
        severity: input.automationGapPct > 70 ? 'HIGH' : 'MEDIUM',
        category: 'operational',
        order: seq,
      })
    }
  }

  return risks
}

// ────────────────────────────────────────────
//  HOURS CALCULATION  —  Bug 4
// ────────────────────────────────────────────

/**
 * Efficiency factor applied to raw hours-reclaimed estimates.
 *
 * Rationale:  Not every hour freed by automation is fully productive.
 * A 0.75 factor accounts for:
 *   – transition/hand-off overhead (5–10 %)
 *   – quality review cycles (5–10 %)
 *   – residual manual steps that can't be automated (5–10 %)
 *
 * Applied as:  effectiveHours = rawHours × EFFICIENCY_FACTOR
 * Always rounded to the nearest integer with Math.round().
 */
export const EFFICIENCY_FACTOR = 0.75

/**
 * Calculate effective hours reclaimed per year after applying the
 * efficiency factor.  Always returns an integer via Math.round().
 *
 * @param rawHoursEstimate – total "raw" hours identified as automatable
 * @param factor – optional override; defaults to EFFICIENCY_FACTOR
 */
export function calcEffectiveHours(
  rawHoursEstimate: number,
  factor: number = EFFICIENCY_FACTOR,
): number {
  return Math.round(rawHoursEstimate * factor)
}

// ────────────────────────────────────────────
//  GENERAL FORMATTERS
// ────────────────────────────────────────────

/** Format a number as a percentage with one decimal place: "42.5%" */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !isFinite(value) || isNaN(value)) return '—'
  return `${value.toFixed(1)}%`
}

/** Format a number of months with singular/plural: "1 month" or "N months" */
export function formatMonths(value: number | null | undefined): string {
  if (value === null || value === undefined || !isFinite(value) || isNaN(value)) return '—'
  const rounded = Math.round(value)
  return rounded === 1 ? '1 month' : `${rounded} months`
}

/** Format an ISO date string as "15 Jun 2025" */
export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '—'
  try {
    const date = new Date(isoString)
    if (isNaN(date.getTime())) return '—'
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

/** Map a DimensionKey to its human-readable label */
export function humanizeDimensionKey(key: string): string {
  const map: Record<string, string> = {
    strategy: 'Strategy',
    data: 'Data',
    process: 'Process',
    people: 'People',
    governance: 'Governance',
  }
  if (key in map) return map[key]
  if (!key) return '—'
  return key.charAt(0).toUpperCase() + key.slice(1)
}

/** Map an OpportunityQuadrant to its human-readable label */
export function humanizeQuadrant(
  quadrant: OpportunityQuadrant | string | null | undefined,
): string {
  if (!quadrant) return '—'
  const map: Record<string, string> = {
    quick_win: 'Quick Win',
    major_project: 'Major Project',
    fill_in: 'Fill In',
    thankless_task: 'Thankless Task',
  }
  return map[quadrant] ?? '—'
}