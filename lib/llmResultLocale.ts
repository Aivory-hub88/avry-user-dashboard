/**
 * The deep-diagnostic AI analysis (vps-bridge lib/diagnosticQueue.js) returns
 * its prose in English at the top level plus, since 2026-10-10, the same
 * content in Bahasa Indonesia under `translations.id`. This picks the copy for
 * the report's locale. Results stored before then have no `translations`, so
 * the Indonesian report keeps showing the English copy with its notice —
 * `isTranslatedId` tells the caller which case it is.
 */
type LlmResult = Record<string, any>

const LOCALIZED_FIELDS = [
  'narrative_summary',
  'strengths',
  'primary_constraints',
  'automation_opportunities',
  'recommended_next_step',
] as const

export function hasIndonesianAnalysis(result: LlmResult | null | undefined): boolean {
  const id = result?.translations?.id
  return !!id && typeof id === 'object' &&
    (typeof id.narrative_summary === 'string' && id.narrative_summary.trim() !== '')
}

export function localizeLlmResult(
  result: LlmResult | null | undefined,
  locale: 'en' | 'id',
): (LlmResult & { isTranslatedId: boolean }) | null {
  if (!result) return null
  if (locale !== 'id' || !hasIndonesianAnalysis(result)) return { ...result, isTranslatedId: false }
  const id = result.translations.id
  const view: LlmResult = { ...result }
  for (const field of LOCALIZED_FIELDS) {
    const value = id[field]
    if (Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim() !== '') {
      view[field] = value
    }
  }
  // Legacy aliases the renderers fall back to — keep them in the same language.
  view.narrative = view.narrative_summary
  view.blockers = view.primary_constraints
  view.opportunities = view.automation_opportunities
  return { ...view, isTranslatedId: true }
}
