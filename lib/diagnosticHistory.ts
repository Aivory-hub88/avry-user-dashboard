/**
 * Phase E1.3/E2.3 (docs/OPS-TRANSFORMATION-NARRATIVE-BRIEF.md §8) — pure
 * helpers over DiagnosticHistoryEntry[] for the delta chip + sparkline.
 * No fetching here (see lib/reportStorage.ts's loadDiagnosticHistory) and no
 * score/financial computation — this only reformats numbers already stored,
 * so it needs no methodologyVersion bump (E-invariant 1).
 */
import type { DiagnosticHistoryEntry } from '@/types/diagnostic'
import { formatDate } from '@/lib/resultFormatters'

export interface DiagnosticDelta {
  /** latest.composite − previous.composite, rounded. Never 0 (see computeDelta). */
  delta: number
  direction: 'up' | 'down'
  /** "since <date>" reference — the previous save's date, formatted like the rest of the page. */
  sinceLabel: string
}

/**
 * Compares the two most recent history rows (assumed newest-first, as
 * returned by GET /api/storage/history).
 *
 * Judgment call: "since" means since the immediately preceding assessment,
 * not the first-ever one. diagnostic_history gets a new row on every save,
 * so entry[1] IS "your last assessment" — that reads more naturally as
 * "improved since March" than a comparison against an arbitrary first
 * snapshot from a year ago would. Returns null (no chip) when there are
 * fewer than 2 entries, either snapshot is malformed, or the composite is
 * unchanged — brief explicitly calls for no chip when flat.
 */
export function computeDelta(history: DiagnosticHistoryEntry[] | null | undefined): DiagnosticDelta | null {
  if (!Array.isArray(history) || history.length < 2) return null
  const [latest, previous] = history
  const latestComposite = latest?.data?.composite
  const previousComposite = previous?.data?.composite
  if (typeof latestComposite !== 'number' || typeof previousComposite !== 'number') return null

  const delta = Math.round(latestComposite - previousComposite)
  if (delta === 0) return null

  return {
    delta,
    direction: delta > 0 ? 'up' : 'down',
    sinceLabel: formatDate(previous.createdAt),
  }
}

/** Chronological (oldest → newest) composite series for the sparkline. */
export function compositeSeries(history: DiagnosticHistoryEntry[] | null | undefined): number[] {
  if (!Array.isArray(history)) return []
  return [...history]
    .reverse()
    .map((entry) => entry?.data?.composite)
    .filter((v): v is number => typeof v === 'number')
}
