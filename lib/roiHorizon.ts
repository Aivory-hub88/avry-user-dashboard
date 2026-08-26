/**
 * Adaptive ROI window helpers.
 *
 * The report used to hard-code a 3-year ROI/NPV window, so any programme
 * whose break-even landed past year 3 published a NEGATIVE headline ROI —
 * arithmetically correct, but it reads as a broken calculation rather than
 * as "this pays back in year 4". `calculateROI` now derives the window from
 * the case itself (`roiHorizonYears`, 3–7). Every label that used to say
 * "3-Year ROI" must go through here so the number and its window can never
 * disagree.
 *
 * Reports stored before 2026-08-26 have no `roiHorizonYears`; those were
 * computed on the fixed 3-year window, so 3 is the correct fallback.
 */

export const LEGACY_ROI_HORIZON_YEARS = 3

export function getRoiHorizonYears(calculations: unknown): number {
  const y = (calculations as { roiHorizonYears?: unknown } | null | undefined)?.roiHorizonYears
  return typeof y === 'number' && isFinite(y) && y > 0 ? Math.round(y) : LEGACY_ROI_HORIZON_YEARS
}

/** "3-Year ROI" / "ROI 5 Tahun" — the window is never hard-coded in copy. */
export function roiLabel(years: number, locale: 'en' | 'id' = 'en'): string {
  return locale === 'id' ? `ROI ${years} Tahun` : `${years}-Year ROI`
}

export function npvLabel(years: number, locale: 'en' | 'id' = 'en'): string {
  return locale === 'id' ? `NPV ${years} Tahun` : `${years}-Year NPV`
}

/** "5-year savings" / "penghematan 5 tahun" — inline prose form. */
export function horizonYearsPhrase(years: number, locale: 'en' | 'id' = 'en'): string {
  return locale === 'id' ? `${years} tahun` : `${years}-year`
}

/**
 * One-line disclosure shown whenever the window is NOT the familiar 3 years,
 * so an extended horizon is never mistaken for a moved goalpost.
 */
export function horizonNote(
  years: number,
  breakEvenYears: number | null | undefined,
  locale: 'en' | 'id' = 'en'
): string | null {
  if (years === LEGACY_ROI_HORIZON_YEARS) return null
  const be =
    typeof breakEvenYears === 'number' && isFinite(breakEvenYears)
      ? locale === 'id'
        ? `${breakEvenYears.toFixed(1).replace('.', ',')} tahun`
        : `${breakEvenYears.toFixed(1)} years`
      : null
  return locale === 'id'
    ? `Jendela ROI diperpanjang ke ${years} tahun${be ? ` karena titik impas kasus ini ada di ${be}` : ''} — bukan 3 tahun standar, agar jendela penilaian mencakup titik impasnya.`
    : `The ROI window is extended to ${years} years${be ? ` because this case breaks even at ${be}` : ''} — not the standard 3, so the appraisal window actually contains the break-even point.`
}
