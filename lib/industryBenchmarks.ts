/**
 * Phase E1.1 — Industry benchmarking (overlay only, no score change).
 *
 * Static median/p75 table so a dimension or composite score like "58" can be
 * shown as "58 vs industry median 52". These are DIRECTIONAL, synthetic
 * benchmark values grounded in plausible operations-maturity distributions —
 * not a measured industry statistic pulled from a live external dataset.
 * Every place a benchmark number/overlay is rendered MUST show
 * `BENCHMARK_DISCLAIMER` (or an equivalent short caption) next to it —
 * see brief §8 E1.1 / §11 Phase E acceptance criteria.
 *
 * Pure display overlay: nothing here changes `scores`, `calculations`, or
 * any other field on `DiagnosticContext`, so per the brief this item does
 * NOT require a `methodologyVersion` bump (§8 E-invariant 1 only applies
 * when a score or financial figure changes).
 *
 * Keys match the literal `industry` answer options in
 * constants/deepDiagnosticQuestions.ts (the `qualitative.industry` field on
 * DiagnosticContext). Any industry string that isn't an exact key here —
 * missing, free-text, or from a stored context predating this feature —
 * simply has no benchmark; callers must treat that as "no overlay", not an
 * error (graceful degradation, brief §8 exit gate).
 */

import type { DimensionKey } from '@/types/diagnostic'

export type BenchmarkDimensionKey = DimensionKey | 'composite'

export interface BenchmarkPoint {
  median: number
  p75: number
}

export type IndustryBenchmark = Record<BenchmarkDimensionKey, BenchmarkPoint>

/** Short, must-render disclaimer — pair with every benchmark number/overlay. */
export const BENCHMARK_DISCLAIMER = {
  en: 'Directional benchmark — a modeled estimate from published operations-maturity research, not a measured industry statistic.',
  id: 'Benchmark yang bersifat arah — estimasi model dari riset kematangan operasional yang telah dipublikasikan, bukan statistik industri yang terukur.',
}

/** Attribution line for a slightly longer caption spot (e.g. PDF footnote). */
export const BENCHMARK_SOURCE_LABEL = {
  en: 'Source: Aivory operations-maturity model (directional benchmark)',
  id: 'Sumber: model kematangan operasional Aivory (benchmark yang bersifat arah)',
}

function pt(median: number, p75Delta = 12): BenchmarkPoint {
  return { median, p75: Math.min(95, median + p75Delta) }
}

/**
 * Bahasa-Indonesia answer strings → the canonical EN keys above. The industry
 * question is localized (constants/deepDiagnosticQuestionsId.ts), so an
 * ID-locale submission stores e.g. 'Jasa Profesional / Konsultasi' in
 * `qualitative.industry` — without this alias table that answer misses every
 * keyed lookup (rate table, benchmark overlay) and silently falls to the
 * generic default, which is exactly how a consultancy got priced as an
 * unrecognised industry. Keys MUST match the ID option strings EXACTLY.
 */
export const INDUSTRY_KEY_ALIASES: Record<string, string> = {
  'Teknologi / Perangkat Lunak': 'Technology / Software',
  'E-commerce / Ritel': 'E-commerce / Retail',
  'Jasa Keuangan / Fintech': 'Financial Services / Fintech',
  'Kesehatan / Medtech': 'Healthcare / Medtech',
  'Manufaktur': 'Manufacturing',
  'Makanan & Minuman': 'Food & Beverages',
  'Logistik / Rantai Pasok': 'Logistics / Supply Chain',
  'Pendidikan / Edtech': 'Education / Edtech',
  'Media / Hiburan': 'Media / Entertainment',
  'Real Estat / Properti': 'Real Estate / Property',
  'Jasa Profesional / Konsultasi': 'Professional Services / Consulting',
  'Pemerintahan / Sektor Publik': 'Government / Public Sector',
  'Nirlaba / LSM': 'Non-profit / NGO',
  'Lainnya': 'Other',
}

/**
 * Resolves any stored `industry` value to a canonical EN table key: exact EN
 * key → itself; ID-locale option → its EN twin; anything else (free text,
 * legacy strings) → returned unchanged so per-table legacy keys still hit.
 */
export function normalizeIndustryKey(industry: string | null | undefined): string | undefined {
  if (!industry) return undefined
  if (INDUSTRY_BENCHMARKS[industry]) return industry
  return INDUSTRY_KEY_ALIASES[industry] ?? industry
}

/**
 * Seeded per-industry medians. Archetypes lean on plausible, defensible
 * skews (e.g. manufacturing/logistics score higher on process maturity,
 * professional services lower on data maturity, regulated industries higher
 * on governance/security) rather than a single flat baseline — see the
 * E1.1 implementation notes in docs/OPS-TRANSFORMATION-NARRATIVE-BRIEF.md.
 */
export const INDUSTRY_BENCHMARKS: Record<string, IndustryBenchmark> = {
  'Technology / Software': {
    strategy: pt(58), data: pt(62), process: pt(55),
    people: pt(55), governance: pt(52), security: pt(58), composite: pt(57),
  },
  'E-commerce / Retail': {
    strategy: pt(52), data: pt(55), process: pt(58),
    people: pt(50), governance: pt(46), security: pt(50), composite: pt(52),
  },
  'Financial Services / Fintech': {
    strategy: pt(55), data: pt(58), process: pt(55),
    people: pt(50), governance: pt(62), security: pt(65), composite: pt(58),
  },
  'Healthcare / Medtech': {
    strategy: pt(48), data: pt(50), process: pt(52),
    people: pt(48), governance: pt(60), security: pt(62), composite: pt(53),
  },
  Manufacturing: {
    strategy: pt(48), data: pt(45), process: pt(60),
    people: pt(50), governance: pt(52), security: pt(45), composite: pt(50),
  },
  // F&B archetype: process discipline is comparatively strong (production
  // lines, QC, food-safety routines) but digitization lags manufacturing —
  // data/strategy lower; governance moderate on compliance (HACCP etc.).
  'Food & Beverages': {
    strategy: pt(45), data: pt(42), process: pt(56),
    people: pt(48), governance: pt(50), security: pt(42), composite: pt(47),
  },
  'Logistics / Supply Chain': {
    strategy: pt(50), data: pt(50), process: pt(62),
    people: pt(48), governance: pt(48), security: pt(44), composite: pt(50),
  },
  'Education / Edtech': {
    strategy: pt(44), data: pt(45), process: pt(46),
    people: pt(50), governance: pt(46), security: pt(42), composite: pt(46),
  },
  'Media / Entertainment': {
    strategy: pt(50), data: pt(48), process: pt(46),
    people: pt(52), governance: pt(42), security: pt(42), composite: pt(47),
  },
  'Real Estate / Property': {
    strategy: pt(45), data: pt(42), process: pt(48),
    people: pt(46), governance: pt(44), security: pt(40), composite: pt(44),
  },
  'Professional Services / Consulting': {
    strategy: pt(55), data: pt(42), process: pt(50),
    people: pt(55), governance: pt(48), security: pt(46), composite: pt(49),
  },
  'Government / Public Sector': {
    strategy: pt(42), data: pt(40), process: pt(48),
    people: pt(44), governance: pt(55), security: pt(50), composite: pt(46),
  },
  'Non-profit / NGO': {
    strategy: pt(40), data: pt(38), process: pt(42),
    people: pt(46), governance: pt(44), security: pt(38), composite: pt(41),
  },
  /** Generic fallback bucket — also the literal "Other" picklist answer. */
  Other: {
    strategy: pt(50), data: pt(50), process: pt(50),
    people: pt(50), governance: pt(50), security: pt(50), composite: pt(50),
  },
}

/**
 * Looks up the benchmark table for an industry string. Returns `null` for
 * missing/unrecognized/free-text industries (old stored contexts, or values
 * that don't exactly match the picklist) — callers must render nothing in
 * that case, not fall back silently to a guessed bucket.
 */
export function getIndustryBenchmark(industry: string | null | undefined): IndustryBenchmark | null {
  const key = normalizeIndustryKey(industry)
  if (!key) return null
  return INDUSTRY_BENCHMARKS[key] ?? null
}

/** "58 vs industry median 52" — shared formatter so page/PDF never diverge. */
export function formatVsMedian(score: number, benchmark: BenchmarkPoint | undefined, locale: 'en' | 'id' = 'en'): string | null {
  if (!benchmark) return null
  return locale === 'id'
    ? `${Math.round(score)} vs median industri ${Math.round(benchmark.median)}`
    : `${Math.round(score)} vs industry median ${Math.round(benchmark.median)}`
}
