/**
 * How a ROI percentage is shown.
 *
 * ROI is a ratio over the investment, so a small counted investment makes it explode, and a display cap turns
 * every scenario into the same uninformative ">999%". The financial case now leads with NPV and payback; ROI is a
 * companion, and past the cap it says "Very high" instead of repeating a capped number that carries no information.
 */
type Locale = 'en' | 'id'

export const ROI_DISPLAY_CAP = 999

export function formatRoi(
  v: number | null | undefined,
  locale: Locale,
  fmtPct: (n: number) => string = (n) => `${Math.round(n)}%`,
  missing = 'N/A',
): string {
  if (v == null || !isFinite(v)) return missing
  if (v >= ROI_DISPLAY_CAP) return locale === 'id' ? 'Sangat tinggi' : 'Very high'
  return fmtPct(v)
}
