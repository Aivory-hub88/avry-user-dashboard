/**
 * "How much does each business operation process improve?" for the Transformation
 * Opportunities section.
 *
 * The model measures the TOTAL improvement (manual hours recovered by closing the gap between today's
 * automation level and the target), not each process separately; the report already splits the total
 * savings across opportunities by their impact score (rankOpportunities). The same allocation gives each
 * process its share of the improvement, and from that the share of today's manual workload it removes.
 * Everything here is derived from fields stored on the report, so it also works for reports saved before
 * this existed. Training is a capability investment with no savings of its own, so it gets no increment.
 */
import type { RankedOpportunity } from '@/types/diagnostic'

type Locale = 'en' | 'id'

export interface ProcessIncrement {
  /** This opportunity's share of the total improvement (impact weight), 0-100. */
  sharePct: number
  /** Share of TODAY's manual workload this process removes, 0-100. */
  workloadRemovedPct: number
  /** Manual hours per year this process removes. */
  hoursPerYear: number
}

export interface IncrementsSummary {
  automationFromPct: number | null
  automationToPct: number | null
  /** Total share of today's manual workload removed, 0-100. */
  workloadRemovedPct: number
  hoursReclaimedPerYear: number
  manualHoursPerYear: number
}

export interface IncrementsView {
  byId: Record<string, ProcessIncrement>
  summary: IncrementsSummary | null
}

export function buildProcessIncrements(
  opportunities: RankedOpportunity[] | null | undefined,
  calc: { hoursReclaimedPerYear?: number | null } | null | undefined,
  quantitative: { totalManualHoursWeekly?: number | null; currentAutomationPct?: number | null; targetAutomationPct?: number | null } | null | undefined,
): IncrementsView {
  const reclaimed = calc?.hoursReclaimedPerYear ?? null
  const weekly = quantitative?.totalManualHoursWeekly ?? null
  const empty: IncrementsView = { byId: {}, summary: null }
  if (!opportunities || !reclaimed || reclaimed <= 0 || !weekly || weekly <= 0) return empty
  const manualPerYear = weekly * 52

  const automation = opportunities.filter((o) => !o.trainingTracks && typeof o.impact === 'number' && o.impact > 0)
  const totalImpact = automation.reduce((sum, o) => sum + o.impact, 0)
  if (automation.length === 0 || totalImpact <= 0) return empty

  const byId: Record<string, ProcessIncrement> = {}
  for (const o of automation) {
    const weight = o.impact / totalImpact
    const hours = reclaimed * weight
    byId[o.id] = {
      sharePct: weight * 100,
      workloadRemovedPct: (hours / manualPerYear) * 100,
      hoursPerYear: hours,
    }
  }
  return {
    byId,
    summary: {
      automationFromPct: quantitative?.currentAutomationPct ?? null,
      automationToPct: quantitative?.targetAutomationPct ?? null,
      workloadRemovedPct: (reclaimed / manualPerYear) * 100,
      hoursReclaimedPerYear: reclaimed,
      manualHoursPerYear: manualPerYear,
    },
  }
}

const pct = (v: number): string => (v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, ''))
const hrs = (v: number, locale: Locale): string => Math.round(v).toLocaleString(locale === 'id' ? 'id-ID' : 'en-US')

/** One line for an opportunity card. */
export function formatIncrementLine(inc: ProcessIncrement, locale: Locale): string {
  return locale === 'id'
    ? `Menyumbang ${pct(inc.sharePct)}% dari peningkatan · mengurangi ${pct(inc.workloadRemovedPct)}% beban kerja manual saat ini (±${hrs(inc.hoursPerYear, locale)} jam/tahun)`
    : `Contributes ${pct(inc.sharePct)}% of the improvement · removes ${pct(inc.workloadRemovedPct)}% of today's manual workload (~${hrs(inc.hoursPerYear, locale)} h/yr)`
}

/** The overall change and how the per-process numbers were derived, once above the cards. */
export function formatIncrementsSummary(view: IncrementsView, locale: Locale): string | null {
  const s = view.summary
  if (!s) return null
  const auto = s.automationFromPct != null && s.automationToPct != null
    ? (locale === 'id'
        ? `Tingkat otomasi naik dari ${Math.round(s.automationFromPct)}% ke ${Math.round(s.automationToPct)}% (+${Math.round(s.automationToPct - s.automationFromPct)} poin). `
        : `Automation level goes from ${Math.round(s.automationFromPct)}% to ${Math.round(s.automationToPct)}% (+${Math.round(s.automationToPct - s.automationFromPct)} points). `)
    : ''
  return locale === 'id'
    ? `${auto}Bersama-sama, peluang di bawah mengurangi ${pct(s.workloadRemovedPct)}% beban kerja manual saat ini (${hrs(s.hoursReclaimedPerYear, locale)} dari ${hrs(s.manualHoursPerYear, locale)} jam per tahun, setelah memperhitungkan efisiensi). Persentase tiap proses adalah pembagian dari total itu menurut skor dampaknya: model mengukur peningkatan totalnya, bukan tiap proses secara terpisah.`
    : `${auto}Together, the opportunities below remove ${pct(s.workloadRemovedPct)}% of today's manual workload (${hrs(s.hoursReclaimedPerYear, locale)} of ${hrs(s.manualHoursPerYear, locale)} hours a year, after an efficiency allowance). Each process's percentage is its share of that total by impact score: the model measures the total improvement, not each process separately.`
}
