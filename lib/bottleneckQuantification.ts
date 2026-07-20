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

const HOURS_RE = /([\d]+(?:\.\d+)?)\s*(?:hrs?|hours?)\b/i

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
    const hours = parseFloat(m[1])
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

function overlapScore(a: string, b: string): number {
  const wa = new Set(significantWords(a))
  const wb = significantWords(b)
  let hits = 0
  for (const w of wb) if (wa.has(w)) hits++
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
export function formatPainPointHours(item: QuantifiedPainPoint): string | null {
  if (item.hoursPerWeek == null) return null
  const hrs = Number.isInteger(item.hoursPerWeek) ? String(item.hoursPerWeek) : item.hoursPerWeek.toFixed(1)
  return item.isEstimated ? `~${hrs} hrs/week (estimated allocation)` : `~${hrs} hrs/week`
}
