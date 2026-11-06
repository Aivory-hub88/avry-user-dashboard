/**
 * ROI, Payback and NPV are computed on the costs the report could PRICE: the user's own setup effort and
 * the recommended software priced for a whole team. Per-seat, per-outlet, metered, fee and quote software,
 * training and data preparation are listed as "not priced" because pricing them would mean inventing a
 * number. When there are such items, a high ROI is a ratio over a cost base that is not complete, so every
 * place that shows it must say so.
 */
type Locale = 'en' | 'id'

export function unpricedCount(calc: { requiredInvestment?: { unpriced?: unknown[] | null } | null } | null | undefined): number {
  const u = calc?.requiredInvestment?.unpriced
  return Array.isArray(u) ? u.length : 0
}

/** Short tag for a tile subtitle, or '' when everything is priced. */
export function pricedOnlyTag(count: number, locale: Locale): string {
  if (count <= 0) return ''
  return locale === 'id' ? ' · hanya biaya yang diberi harga' : ' · priced costs only'
}

/** A sentence for under a block of ROI figures, or null when everything is priced. */
export function pricedOnlyNote(count: number, locale: Locale): string | null {
  if (count <= 0) return null
  return locale === 'id'
    ? `ROI dan payback dihitung hanya dari biaya yang bisa diberi harga. ${count} item (pelatihan, persiapan data, atau software yang butuh jumlah pengguna atau kuotasi) belum diberi harga, jadi ROI yang sebenarnya lebih rendah. Rinciannya ada di bagian Investasi.`
    : `ROI and payback use only the costs that could be priced. ${count} item${count === 1 ? '' : 's'} (training, data preparation, or software that needs a seat count or a quote) ${count === 1 ? 'is' : 'are'} not priced, so the real ROI is lower. See the Investment section for the list.`
}
