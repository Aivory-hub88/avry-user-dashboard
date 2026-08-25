/**
 * Currency state machine for the Deep Diagnostic — single source of truth for
 * everything that must adapt when the user picks a currency:
 *
 *   1. Revenue bands        (question options + USD midpoints)
 *   2. Budget bands         (question options + USD midpoints)
 *   3. Labour benchmarks    (per-country hourly wage anchor for ROI math)
 *
 * WHY A TABLE, NOT IF/ELSE: every currency-aware surface (wizard options,
 * budget parsing, ROI hourly rate, benchmark disclosure label) reads from
 * here, so adding a currency = adding one entry per table, never another
 * else-if branch. The IDR/EUR branches that used to live inline in
 * services/deepDiagnostic.ts are preserved EXACTLY (same anchors, same
 * rounding points) — they just moved into this table.
 *
 * Stored answers are always the canonical EN band label; ID labels are
 * display-only. resolveBandMidpointUSD() matches both, plus falls back to the
 * legacy free-text "$Nk" parser for old saved answers.
 */
import type { CurrencyCode } from '@/lib/resultFormatters'

export interface CurrencyBand {
  /** Canonical stored value (English). */
  en: string
  /** Display-only Indonesian label. */
  id: string
  /** USD midpoint used by the ROI engine; null = band carries no figure. */
  midpointUSD: number | null
}

export interface LabourBenchmark {
  /** Anchor hourly rate in the LOCAL currency (fully-loaded, entry/formal floor). */
  hourlyLocal: number
  /** Monthly anchor the hourly rate derives from (for the report's methodology note). */
  monthlyAnchorLocal: number
  /** Statutory/standard monthly working hours divisor. */
  workHoursPerMonth: number
  /** Human-readable disclosure, surfaced in the report next to the ROI figure. */
  labelEn: string
  labelId: string
}

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET BANDS — "If yes, what is your budget range?" (Phase 3)
// USD entry reproduces the legacy option set + parseBudgetMidpointUSD midpoints
// exactly, so old stored answers keep resolving identically.
// ─────────────────────────────────────────────────────────────────────────────
export const BUDGET_BANDS: Record<CurrencyCode, CurrencyBand[]> = {
  USD: [
    { en: 'Under $10k', id: 'Di bawah $10K', midpointUSD: 5_000 },
    { en: '$10k - $50k', id: '$10K - $50K', midpointUSD: 30_000 },
    { en: '$50k - $100k', id: '$50K - $100K', midpointUSD: 75_000 },
    { en: '$100k - $500k', id: '$100K - $500K', midpointUSD: 300_000 },
    { en: 'Over $500k', id: 'Di atas $500K', midpointUSD: 750_000 },
    { en: 'Not applicable', id: 'Tidak berlaku', midpointUSD: null },
  ],
  // IDR bands use the juta/miliar scale Indonesian SMEs actually budget in,
  // instead of dollar figures through FX. Midpoints at ≈Rp 16.000/USD.
  IDR: [
    { en: 'Under Rp 100 juta', id: 'Di bawah Rp 100 juta', midpointUSD: 3_125 },
    { en: 'Rp 100 – 500 juta', id: 'Rp 100 – 500 juta', midpointUSD: 18_750 },
    { en: 'Rp 500 juta – Rp 1 miliar', id: 'Rp 500 juta – Rp 1 miliar', midpointUSD: 46_875 },
    { en: 'Rp 1 – 10 miliar', id: 'Rp 1 – 10 miliar', midpointUSD: 343_750 },
    { en: 'Rp 10 – 100 miliar', id: 'Rp 10 – 100 miliar', midpointUSD: 3_437_500 },
    { en: 'Over Rp 100 miliar', id: 'Di atas Rp 100 miliar', midpointUSD: 9_375_000 },
    { en: 'Not applicable', id: 'Tidak berlaku', midpointUSD: null },
  ],
  AED: [
    { en: 'Under AED 25,000', id: 'Di bawah AED 25.000', midpointUSD: 3_400 },
    { en: 'AED 25,000 – 100,000', id: 'AED 25.000 – 100.000', midpointUSD: 17_000 },
    { en: 'AED 100,000 – 250,000', id: 'AED 100.000 – 250.000', midpointUSD: 47_700 },
    { en: 'AED 250,000 – 1,000,000', id: 'AED 250.000 – 1.000.000', midpointUSD: 170_000 },
    { en: 'Over AED 1,000,000', id: 'Di atas AED 1.000.000', midpointUSD: 409_000 },
    { en: 'Not applicable', id: 'Tidak berlaku', midpointUSD: null },
  ],
  SAR: [
    { en: 'Under SAR 25,000', id: 'Di bawah SAR 25.000', midpointUSD: 3_333 },
    { en: 'SAR 25,000 – 100,000', id: 'SAR 25.000 – 100.000', midpointUSD: 16_667 },
    { en: 'SAR 100,000 – 250,000', id: 'SAR 100.000 – 250.000', midpointUSD: 46_667 },
    { en: 'SAR 250,000 – 1,000,000', id: 'SAR 250.000 – 1.000.000', midpointUSD: 166_667 },
    { en: 'Over SAR 1,000,000', id: 'Di atas SAR 1.000.000', midpointUSD: 400_000 },
    { en: 'Not applicable', id: 'Tidak berlaku', midpointUSD: null },
  ],
  OMR: [
    { en: 'Under OMR 2,500', id: 'Di bawah OMR 2.500', midpointUSD: 3_250 },
    { en: 'OMR 2,500 – 10,000', id: 'OMR 2.500 – 10.000', midpointUSD: 16_250 },
    { en: 'OMR 10,000 – 25,000', id: 'OMR 10.000 – 25.000', midpointUSD: 45_500 },
    { en: 'OMR 25,000 – 100,000', id: 'OMR 25.000 – 100.000', midpointUSD: 162_500 },
    { en: 'Over OMR 100,000', id: 'Di atas OMR 100.000', midpointUSD: 390_000 },
    { en: 'Not applicable', id: 'Tidak berlaku', midpointUSD: null },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// REVENUE BANDS — "What is your approximate annual revenue?" (Phase 1)
// 'Pre-revenue / Startup' label is load-bearing (risk rule matches it
// case-insensitively) — kept verbatim in every currency.
// ─────────────────────────────────────────────────────────────────────────────
export const REVENUE_BANDS: Record<CurrencyCode, CurrencyBand[]> = {
  USD: [
    { en: 'Pre-revenue / Startup', id: 'Belum Berpendapatan / Startup', midpointUSD: null },
    { en: 'Under $100k', id: 'Di bawah $100K', midpointUSD: 50_000 },
    { en: '$100k – $500k', id: '$100K – $500K', midpointUSD: 300_000 },
    { en: '$500k – $1M', id: '$500K – $1M', midpointUSD: 750_000 },
    { en: '$1M – $5M', id: '$1M – $5M', midpointUSD: 3_000_000 },
    { en: '$5M – $20M', id: '$5M – $20M', midpointUSD: 12_500_000 },
    { en: '$20M – $100M', id: '$20M – $100M', midpointUSD: 60_000_000 },
    { en: 'Over $100M', id: 'Di atas $100M', midpointUSD: 150_000_000 },
    { en: 'Prefer not to say', id: 'Tidak ingin menyebutkan', midpointUSD: null },
  ],
  IDR: [
    { en: 'Pre-revenue / Startup', id: 'Belum Berpendapatan / Startup', midpointUSD: null },
    { en: 'Under Rp 1 miliar', id: 'Di bawah Rp 1 miliar', midpointUSD: 31_250 },
    { en: 'Rp 1 – 5 miliar', id: 'Rp 1 – 5 miliar', midpointUSD: 187_500 },
    { en: 'Rp 5 – 25 miliar', id: 'Rp 5 – 25 miliar', midpointUSD: 937_500 },
    { en: 'Rp 25 – 100 miliar', id: 'Rp 25 – 100 miliar', midpointUSD: 3_900_000 },
    { en: 'Rp 100 – 500 miliar', id: 'Rp 100 – 500 miliar', midpointUSD: 18_750_000 },
    { en: 'Over Rp 500 miliar', id: 'Di atas Rp 500 miliar', midpointUSD: 46_875_000 },
    { en: 'Prefer not to say', id: 'Tidak ingin menyebutkan', midpointUSD: null },
  ],
  AED: [
    { en: 'Pre-revenue / Startup', id: 'Belum Berpendapatan / Startup', midpointUSD: null },
    { en: 'Under AED 500,000', id: 'Di bawah AED 500.000', midpointUSD: 136_000 },
    { en: 'AED 500,000 – 2,000,000', id: 'AED 500.000 – 2.000.000', midpointUSD: 409_000 },
    { en: 'AED 2,000,000 – 10,000,000', id: 'AED 2.000.000 – 10.000.000', midpointUSD: 2_043_000 },
    { en: 'AED 10,000,000 – 50,000,000', id: 'AED 10.000.000 – 50.000.000', midpointUSD: 10_217_000 },
    { en: 'AED 50,000,000 – 200,000,000', id: 'AED 50.000.000 – 200.000.000', midpointUSD: 40_869_000 },
    { en: 'Over AED 200,000,000', id: 'Di atas AED 200.000.000', midpointUSD: 136_239_000 },
    { en: 'Prefer not to say', id: 'Tidak ingin menyebutkan', midpointUSD: null },
  ],
  SAR: [
    { en: 'Pre-revenue / Startup', id: 'Belum Berpendapatan / Startup', midpointUSD: null },
    { en: 'Under SAR 500,000', id: 'Di bawah SAR 500.000', midpointUSD: 133_333 },
    { en: 'SAR 500,000 – 2,000,000', id: 'SAR 500.000 – 2.000.000', midpointUSD: 400_000 },
    { en: 'SAR 2,000,000 – 10,000,000', id: 'SAR 2.000.000 – 10.000.000', midpointUSD: 2_000_000 },
    { en: 'SAR 10,000,000 – 50,000,000', id: 'SAR 10.000.000 – 50.000.000', midpointUSD: 10_000_000 },
    { en: 'SAR 50,000,000 – 200,000,000', id: 'SAR 50.000.000 – 200.000.000', midpointUSD: 40_000_000 },
    { en: 'Over SAR 200,000,000', id: 'Di atas SAR 200.000.000', midpointUSD: 133_333_333 },
    { en: 'Prefer not to say', id: 'Tidak ingin menyebutkan', midpointUSD: null },
  ],
  OMR: [
    { en: 'Pre-revenue / Startup', id: 'Belum Berpendapatan / Startup', midpointUSD: null },
    { en: 'Under OMR 100,000', id: 'Di bawah OMR 100.000', midpointUSD: 130_000 },
    { en: 'OMR 100,000 – 500,000', id: 'OMR 100.000 – 500.000', midpointUSD: 390_000 },
    { en: 'OMR 500,000 – 2,000,000', id: 'OMR 500.000 – 2.000.000', midpointUSD: 1_625_000 },
    { en: 'OMR 2,000,000 – 10,000,000', id: 'OMR 2.000.000 – 10.000.000', midpointUSD: 7_800_000 },
    { en: 'Over OMR 10,000,000', id: 'Di atas OMR 10.000.000', midpointUSD: 32_500_000 },
    { en: 'Prefer not to say', id: 'Tidak ingin menyebutkan', midpointUSD: null },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// LABOUR BENCHMARKS — per-country wage anchor for the ROI hourly rate.
// null = no local anchor; the US industry table applies (existing behaviour
// for USD and currencies without a defensible local benchmark yet).
//
// Sources:
//  - IDR  : UMP DKI Jakarta 2026, Rp 5.729.876/month (Kepgub DKI; +6.17% on
//           2025). Update when the next UMP is gazetted (~late November).
//  - EUR  : Eurostat EU-27 average hourly labour cost, ≈€30/hr.
//  - AED  : UAE has NO statutory private-sector minimum wage. Anchored to an
//           estimated formal-sector entry wage of AED 5.000/month — a
//           conservative, commonly cited floor for employed expat staff.
//           Documented as an estimate in the label for that reason.
//  - SAR  : Statutory minimum wage for Saudi nationals, SAR 4.000/month
//           (MHRSD, Nitaqat programme, 2021). Expat floor differs; the label
//           discloses the anchor.
//  - OMR  : Oman statutory minimum wage for Omanis, OMR 325/month
//           (Ministerial Decision 296/2008).
// ─────────────────────────────────────────────────────────────────────────────
export const LABOUR_BENCHMARKS: Partial<Record<CurrencyCode, LabourBenchmark>> = {
  IDR: {
    monthlyAnchorLocal: 5_729_876,
    workHoursPerMonth: 173,
    hourlyLocal: 5_729_876 / 173, // ≈ Rp 33.121/hr
    labelEn: 'DKI Jakarta minimum wage (UMP) 2026',
    labelId: 'UMP DKI Jakarta 2026',
  },
  EUR: {
    monthlyAnchorLocal: 30 * 173,
    workHoursPerMonth: 173,
    hourlyLocal: 30,
    labelEn: 'EU average labour cost (Eurostat estimate)',
    labelId: 'rata-rata upah EU (estimasi Eurostat)',
  },
  AED: {
    monthlyAnchorLocal: 5_000,
    workHoursPerMonth: 173,
    hourlyLocal: 5_000 / 173, // ≈ AED 28.90/hr
    labelEn: 'UAE estimated formal-sector entry wage (no statutory minimum wage)',
    labelId: 'Estimasi upah entry-level sektor formal UAE (tidak ada upah minimum statutori)',
  },
  SAR: {
    monthlyAnchorLocal: 4_000,
    workHoursPerMonth: 173,
    hourlyLocal: 4_000 / 173, // ≈ SAR 23.12/hr
    labelEn: 'Saudi Arabia statutory minimum wage (SAR 4,000/month, Nitaqat)',
    labelId: 'Upah minimum statutori Arab Saudi (SAR 4.000/bulan, Nitaqat)',
  },
  OMR: {
    monthlyAnchorLocal: 325,
    workHoursPerMonth: 173,
    hourlyLocal: 325 / 173, // ≈ OMR 1.88/hr
    labelEn: 'Oman statutory minimum wage (OMR 325/month)',
    labelId: 'Upah minimum statutori Oman (OMR 325/bulan)',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Accessors
// ─────────────────────────────────────────────────────────────────────────────

/** Budget bands for a currency; currencies without a dedicated table fall back to USD. */
export function getBudgetBands(currency: CurrencyCode): CurrencyBand[] {
  return BUDGET_BANDS[currency] ?? BUDGET_BANDS.USD
}

/** Revenue bands for a currency; currencies without a dedicated table fall back to USD. */
export function getRevenueBands(currency: CurrencyCode): CurrencyBand[] {
  return REVENUE_BANDS[currency] ?? REVENUE_BANDS.USD
}

/** Labour benchmark for a currency; null → US industry-table path. */
export function getLabourBenchmark(currency: CurrencyCode): LabourBenchmark | null {
  return LABOUR_BENCHMARKS[currency] ?? null
}

/**
 * Resolve a stored band answer to its USD midpoint.
 * Matches the currency's band table on the EN (stored) or ID (display) label;
 * falls back to the legacy free-text parser for old saved answers that
 * predate the band tables. Returns null for no-figure bands ('Not
 * applicable', 'Prefer not to say') and unrecognised answers alike — callers
 * treat null as "no data".
 */
export function resolveBandMidpointUSD(
  kind: 'budget' | 'revenue',
  currency: CurrencyCode,
  label: string | undefined,
): number | null {
  if (!label) return null
  const bands = kind === 'budget' ? getBudgetBands(currency) : getRevenueBands(currency)
  const hit = bands.find((b) => b.en === label || b.id === label)
  if (hit) return hit.midpointUSD
  return null // caller falls back to legacy parsing / null
}

/**
 * Compact local-currency formatting for band-scale figures — "Rp 18,75 juta"
 * instead of "Rp 18.750.000". Used where screen space is tight (question
 * options, KPI tiles). Returns the plain formatted amount for currencies
 * without a compact scale.
 */
export function formatCompactLocal(value: number, currency: CurrencyCode): string {
  if (!isFinite(value)) return ''
  if (currency === 'IDR') {
    const juta = value / 1_000_000
    if (Math.abs(value) >= 1_000_000_000) {
      const miliar = value / 1_000_000_000
      return `Rp ${trimZeros(miliar)} miliar`
    }
    if (Math.abs(value) >= 1_000_000) return `Rp ${trimZeros(juta)} juta`
    return `Rp ${Math.round(value).toLocaleString('id-ID')}`
  }
  const symbol = currency === 'USD' ? '$' : `${currency} `
  if (Math.abs(value) >= 1_000_000_000) return `${symbol}${trimZeros(value / 1_000_000_000)}B`
  if (Math.abs(value) >= 1_000_000) return `${symbol}${trimZeros(value / 1_000_000)}M`
  if (Math.abs(value) >= 1_000) return `${symbol}${trimZeros(value / 1_000)}k`
  return `${symbol}${Math.round(value)}`
}

function trimZeros(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '')
}
