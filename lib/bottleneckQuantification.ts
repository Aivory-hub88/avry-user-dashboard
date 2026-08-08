/**
 * Phase E, slice E1.5 — Bottleneck quantification.
 *
 * Turns `qualitative.topPainPoints` (free text) into per-pain-point estimated
 * hours/week and, when a labor rate is available, an annualized cost figure.
 * Shared by the on-screen result page (app/diagnostics/deep/final-result/page.tsx)
 * and the PDF export (lib/pdfExport.ts) so both surfaces derive identical
 * numbers from identical parsing — no independent copies to drift.
 *
 * Source of truth priority:
 *   1. `qualitative.painPointHours` (optional intake field, question id
 *      `pain_point_hours`, added in Slice 2) — real per-pain-point estimates
 *      the user typed, e.g. "Invoice entry ~10 hrs/week; chasing approvals ~5 hrs/week".
 *   2. Fallback: equal-weight allocation of `calculations.hoursReclaimedPerYear`
 *      across however many pain points were listed, labeled "estimated
 *      allocation" so it reads differently from real data.
 *
 * This is a pure display derivation — it never invents a new independent
 * number. The only inputs are strings the user already typed and
 * `hoursReclaimedPerYear` / `assumedHourlyRateLocal`, both of which already
 * exist in `calculations` and already drive the ROI math elsewhere in the
 * report.
 */

export interface QuantifiedPainPoint {
  /** The pain-point text as typed (or split out of a numbered/comma list). */
  label: string
  /** Estimated hours/week attributable to this pain point, or null if unknown. */
  hoursPerWeek: number | null
  /** True when hoursPerWeek came from the equal-weight fallback, not real user data. */
  isEstimated: boolean
  /** hoursPerWeek × 52 × assumedHourlyRateLocal, or null when either input is unavailable. */
  annualCostLocal: number | null
}

/** Coerce the qualitative-field shapes we might see (string, array, undefined) to a plain string. */
function normalizeText(v: string | string[] | null | undefined): string {
  if (!v) return ''
  if (Array.isArray(v)) return v.join(', ')
  return v.trim()
}

/**
 * Split free text into individual pain-point/segment strings. Mirrors the
 * numbered-list-vs-comma-split fallback already used for `topPainPoints` on
 * the result page (app/diagnostics/deep/final-result/page.tsx).
 */
export function splitPainPoints(text: string | string[] | null | undefined): string[] {
  const t = normalizeText(text)
  if (!t) return []
  const parts = /\d+\.\s+/.test(t) ? t.split(/\d+\.\s+/) : t.split(/,\s*/)
  return parts.map((s) => s.trim()).filter(Boolean)
}

/**
 * Split `painPointHours` free text into per-item segments. The intake
 * question has no fixed format (just a placeholder example using ";"), so
 * segmentation tries, in order: numbered list, then ";"/newline (the natural
 * separator for "label ~N hrs/week" entries), then comma (same fallback as
 * `topPainPoints`).
 */
function splitHoursSegments(text: string): string[] {
  const t = text.trim()
  if (!t) return []
  if (/\d+\.\s+/.test(t)) return t.split(/\d+\.\s+/).map((s) => s.trim()).filter(Boolean)
  if (/[;\n]/.test(t)) return t.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean)
  return t.split(/,\s*/).map((s) => s.trim()).filter(Boolean)
}

// Recognizes both English ("10 hrs"/"10 hours") and Indonesian ("10 jam"/
// "10j") hour units, and both decimal separators ("10.5"/"10,5"). Missing
// the Indonesian unit meant every Bahasa Indonesia painPointHours answer
// (e.g. "onboarding ~10j, pelaporan ~6j") silently failed to parse at all —
// parsedHours.length stayed 0, so real per-item estimates always fell
// through to the equal-weight fallback below, producing the exact same
// hours/cost figure for every distinct pain point.
const HOURS_RE = /([\d]+(?:[.,]\d+)?)\s*(?:hrs?|hours?|jam|j)\b/i

interface ParsedHoursEntry {
  label: string
  hoursPerWeek: number
}

/** Best-effort extraction of {label, hoursPerWeek} pairs from `painPointHours` free text. */
function parsePainPointHoursText(text: string | null | undefined): ParsedHoursEntry[] {
  const segments = splitHoursSegments(normalizeText(text))
  const results: ParsedHoursEntry[] = []
  for (const seg of segments) {
    const m = seg.match(HOURS_RE)
    if (!m || m.index == null) continue
    const hours = parseFloat(m[1].replace(',', '.'))
    if (!isFinite(hours) || hours <= 0) continue
    const label = seg.slice(0, m.index).trim().replace(/[-:~]+$/, '').trim()
    results.push({ label: label || seg.trim(), hoursPerWeek: hours })
  }
  return results
}

const STOPWORDS = new Set(['the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'a', 'an'])

function significantWords(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
}

// Minimum shared-substring length before two differently-inflected words
// count as a match (see stemMatch below). Short enough to catch real
// Indonesian affixation, long enough to avoid coincidental hits.
const STEM_MATCH_MIN_LEN = 5

/**
 * True if two words are plausibly the same root under Indonesian (or
 * English) affixation — e.g. "laporan"/"pelaporan" (report/reporting,
 * pe-...-an circumfix) or "otomasi"/"mengotomasi". Exact-word overlap alone
 * misses these because prefixes/circumfixes change the token entirely, which
 * silently defeated per-item hour matching for Indonesian-language
 * submissions and forced them into the equal-weight estimate fallback even
 * when the user had typed distinct per-item numbers.
 */
function stemMatch(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (short.length < STEM_MATCH_MIN_LEN) return false
  return long.includes(short)
}

function overlapScore(a: string, b: string): number {
  const wa = [...significantWords(a)]
  const wb = significantWords(b)
  let hits = 0
  for (const w of wb) if (wa.some((x) => stemMatch(x, w))) hits++
  return hits
}

/**
 * Best-effort alignment of parsed `painPointHours` entries to the
 * `topPainPoints` list, by shared-word overlap (greedy, highest score
 * first). A pain point with no matching hours entry gets `null` — we never
 * invent a figure for it.
 */
function matchHoursToPainPoints(painPoints: string[], parsed: ParsedHoursEntry[]): (number | null)[] {
  const result: (number | null)[] = painPoints.map(() => null)
  if (parsed.length === 0) return result

  const pairs: { pi: number; hi: number; score: number }[] = []
  painPoints.forEach((pp, pi) => {
    parsed.forEach((h, hi) => {
      const score = overlapScore(pp, h.label)
      if (score > 0) pairs.push({ pi, hi, score })
    })
  })
  pairs.sort((a, b) => b.score - a.score)

  const usedP = new Set<number>()
  const usedH = new Set<number>()
  for (const { pi, hi } of pairs) {
    if (usedP.has(pi) || usedH.has(hi)) continue
    result[pi] = parsed[hi].hoursPerWeek
    usedP.add(pi)
    usedH.add(hi)
  }

  // Single pain point + single (unmatched-by-words) hours entry — trivially
  // aligned even if wording didn't overlap (e.g. label rephrased entirely).
  if (painPoints.length === 1 && parsed.length === 1 && result[0] == null) {
    result[0] = parsed[0].hoursPerWeek
  }

  // Equal counts strongly imply a 1:1 correspondence the user intended (they
  // listed N pain points and N hour estimates) even when a couple of labels
  // didn't share a stem at all (e.g. "laporan tersebar" vs "koordinasi ~4j"
  // once the other two pairs already claimed their better-scoring matches).
  // Fill any still-unmatched slots positionally in original order rather
  // than leaving them blank or falling through to the equal-weight
  // fallback — this is what actually differentiates 3 distinct pain points
  // instead of showing the same estimated figure for all of them.
  if (painPoints.length === parsed.length) {
    const remainingP = painPoints.map((_, i) => i).filter((i) => !usedP.has(i))
    const remainingH = parsed.map((_, i) => i).filter((i) => !usedH.has(i))
    remainingP.forEach((pi, idx) => {
      const hi = remainingH[idx]
      if (hi !== undefined) result[pi] = parsed[hi].hoursPerWeek
    })
  }

  return result
}

/**
 * Derive per-pain-point hours (and, when possible, annualized cost) for
 * `topPainPoints`. Returns `[]` when there are no pain points at all, so
 * callers can fall back to the original plain rendering untouched.
 */
export function quantifyPainPoints(params: {
  topPainPoints: string | string[] | null | undefined
  painPointHours: string | string[] | null | undefined
  hoursReclaimedPerYear: number | null | undefined
  assumedHourlyRateLocal: number | null | undefined
}): QuantifiedPainPoint[] {
  const painPoints = splitPainPoints(params.topPainPoints)
  if (painPoints.length === 0) return []

  const parsedHours = parsePainPointHoursText(normalizeText(params.painPointHours))

  let hoursPerItem: (number | null)[]
  let isEstimated: boolean

  if (parsedHours.length > 0) {
    // Primary source: real per-pain-point estimates from the intake answer.
    hoursPerItem = matchHoursToPainPoints(painPoints, parsedHours)
    isEstimated = false
  } else if (params.hoursReclaimedPerYear && params.hoursReclaimedPerYear > 0) {
    // Fallback: equal-weight allocation of the annual reclaimed hours.
    const weeklyEach = params.hoursReclaimedPerYear / 52 / painPoints.length
    hoursPerItem = painPoints.map(() => weeklyEach)
    isEstimated = true
  } else {
    hoursPerItem = painPoints.map(() => null)
    isEstimated = true
  }

  return painPoints.map((label, i) => {
    const hoursPerWeek = hoursPerItem[i]
    const annualCostLocal =
      hoursPerWeek != null && params.assumedHourlyRateLocal != null
        ? hoursPerWeek * 52 * params.assumedHourlyRateLocal
        : null
    return { label, hoursPerWeek, isEstimated, annualCostLocal }
  })
}

/** "~10 hrs/week" or "~10 hrs/week (estimated allocation)"; null when hours are unknown. */
export function formatPainPointHours(item: QuantifiedPainPoint, locale: 'en' | 'id' = 'en'): string | null {
  if (item.hoursPerWeek == null) return null
  const hrsRaw = Number.isInteger(item.hoursPerWeek) ? String(item.hoursPerWeek) : item.hoursPerWeek.toFixed(1)
  const hrs = locale === 'id' ? hrsRaw.replace('.', ',') : hrsRaw
  if (locale === 'id') {
    return item.isEstimated ? `~${hrs} jam/minggu (alokasi estimasi)` : `~${hrs} jam/minggu`
  }
  return item.isEstimated ? `~${hrs} hrs/week (estimated allocation)` : `~${hrs} hrs/week`
}

/**
 * The cost figure to DISPLAY for a pain point — full precision for real,
 * user-provided hours; rounded to ~2 significant figures for the
 * equal-weight fallback. An even split of the same total across N pain
 * points produces byte-identical costs for every item (e.g. two different
 * pain points both landing on exactly "IDR 109,042,500/yr") — at full
 * precision that reads as a copy-paste bug, not a proportional estimate.
 * Rounding it (to ~IDR 110,000,000) keeps the shared-estimate framing
 * honest without changing the underlying number used anywhere else.
 */
export function displayPainPointCost(item: QuantifiedPainPoint): number | null {
  const v = item.annualCostLocal
  if (v == null) return v
  if (!item.isEstimated || v === 0) return v
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 1)
  return Math.round(v / magnitude) * magnitude
}
