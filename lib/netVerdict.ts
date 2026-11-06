/**
 * Plain-language verdict for a Financial Case whose recommended scope does not
 * cover its own running cost (net annual savings < 0). The payback/ROI tiles
 * are shown before running costs, so without this the headline reads healthy
 * while Net Annual Savings, NPV and Net Payback read negative. Returns null
 * when the case pays for itself or the inputs are missing.
 */
type Locale = 'en' | 'id'

export interface NetVerdictInput {
  totalAnnualSavingsLocal?: number | null
  annualOngoingCostLocal?: number | null
  netAnnualSavingsLocal?: number | null
  hoursReclaimedPerYear?: number | null
  /** e.g. "Business", so the reader knows which plan the running cost is. */
  planName?: string | null
}

export function buildNetVerdict(
  calc: NetVerdictInput | null | undefined,
  locale: Locale,
  fmt: (n: number) => string,
): string | null {
  if (!calc) return null
  const { totalAnnualSavingsLocal: value, annualOngoingCostLocal: cost, netAnnualSavingsLocal: net, hoursReclaimedPerYear: hours } = calc
  if (![value, cost, net, hours].every((v) => typeof v === 'number' && isFinite(v as number))) return null
  if ((net as number) >= 0 || (value as number) <= 0 || (hours as number) <= 0) return null

  const short = fmt(-(net as number))
  const plan = calc.planName ? `${calc.planName} ` : ''
  // Savings scale linearly with reclaimed hours, so the break-even hours are proportional.
  const needed = Math.ceil(((hours as number) * (cost as number)) / (value as number))
  const have = Math.round(hours as number)
  return locale === 'id'
    ? `Secara bersih, cakupan ini belum menutup biayanya sendiri. Nilai yang dihasilkan ${fmt(value as number)} per tahun, sedangkan plan Aivory ${plan}memakan ${fmt(cost as number)} per tahun mulai tahun ke-2 (penjelasannya ada di bagian investasi di atas), sehingga setiap tahun setelah tahun pertama kurang ${short}. Agar plan tertutup, diperlukan sekitar ${needed.toLocaleString('id-ID')} jam pulih per tahun (cakupan ini memulihkan ${have.toLocaleString('id-ID')} jam). Cakupan otomasi yang lebih besar yang menggeser angka ini. Kotak Payback dan ROI di bawah ditampilkan sebelum biaya berjalan.`
    : `On a net basis this scope does not cover its own running cost yet. It creates ${fmt(value as number)} of value per year, but the Aivory ${plan}plan costs ${fmt(cost as number)} per year from year 2 (explained in the investment section above), so every year after the first is ${short} short. Covering the plan takes about ${needed.toLocaleString('en-US')} recovered hours per year (this scope recovers ${have.toLocaleString('en-US')}); a larger automation scope is what moves this. The Payback and ROI tiles below are shown before running costs.`
}
