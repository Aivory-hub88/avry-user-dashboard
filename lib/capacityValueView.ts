/**
 * Display model for the capacity-value (cost avoidance) line — shared by the
 * report page and the PDF. Pure formatting over fields calculateROI() stored;
 * returns null when the user gave no growth (or nothing is absorbable), so
 * neither surface renders an empty block.
 */
type Locale = 'en' | 'id'

interface Calc {
  capacityGrowthPct?: number | null
  capacityRealizationFactor?: number
  capacityAvoidedHoursPerYear?: number | null
  capacityAvoidanceLocal?: number | null
  /** The yearly value the Financial Case reports (local currency), before any cost avoided. */
  totalAnnualSavingsLocal?: number | null
  efficiencyFactor?: number
}

export interface CapacityValueView {
  title: string
  explanation: string
  rows: { label: string; value: string; emphasis?: boolean }[]
  footnote: string
}

/** Hours of one full-time employee per year (40 h × 52 weeks). */
const FTE_HOURS_PER_YEAR = 2080

export function buildCapacityValueView(
  calc: Calc | null | undefined,
  fmt: (v: number) => string,
  locale: Locale = 'en',
): CapacityValueView | null {
  const hours = calc?.capacityAvoidedHoursPerYear
  const value = calc?.capacityAvoidanceLocal
  const growth = calc?.capacityGrowthPct
  if (!calc || !hours || !value || !growth) return null
  const id = locale === 'id'
  const realization = Math.round((calc.capacityRealizationFactor ?? 0.5) * 100)
  const eff = Math.round((calc.efficiencyFactor ?? 0.75) * 100)
  const fte = hours / FTE_HOURS_PER_YEAR
  const num = (v: number, digits = 1) => id ? v.toFixed(digits).replace('.', ',') : v.toFixed(digits)
  const growthLabel = growth >= 100 ? (id ? '100% atau lebih' : '100% or more') : `±${num(growth, growth % 1 ? 1 : 0)}%`

  const rows: CapacityValueView['rows'] = [
    { label: id ? 'Pertumbuhan volume yang Anda perkirakan (12 bulan)' : 'Volume growth you expect (12 months)', value: growthLabel },
    {
      label: id ? 'Jam kerja tambahan yang diserap otomasi' : 'Extra work hours absorbed by automation',
      value: `${Math.round(hours).toLocaleString(id ? 'id-ID' : 'en-US')} ${id ? 'jam/tahun' : 'h/yr'}${fte >= 0.1 ? ` (≈ ${num(fte)} FTE)` : ''}`,
    },
    { label: id ? 'Biaya rekrutmen yang dihindari' : 'Hiring cost avoided', value: `${fmt(value)}${id ? '/tahun' : '/yr'}`, emphasis: true },
  ]
  // One plain figure instead of a second ROI: the yearly value of the Financial Case plus the hiring cost avoided.
  const base = calc.totalAnnualSavingsLocal
  if (base != null && base > 0) {
    rows.push({
      label: id ? 'Total nilai per tahun bila pertumbuhan terjadi' : 'Total yearly value if the growth happens',
      value: `${fmt(base + value)}${id ? '/tahun' : '/yr'} (${id ? `${fmt(base)} nilai cakupan + ${fmt(value)} biaya yang dihindari` : `${fmt(base)} scope value + ${fmt(value)} cost avoided`})`,
    })
  }

  return {
    title: id ? 'Nilai kapasitas — biaya rekrutmen yang dihindari (bergantung pada pertumbuhan)' : 'Capacity value — hiring cost avoided (depends on growth)',
    explanation: id
      ? `Kalau volume tumbuh sesuai perkiraan Anda, pekerjaan manual ikut bertambah. Otomasi yang sama menyerap sebagian jam tambahan itu, sehingga Anda tidak perlu merekrut untuk menanganinya. Nilai ini dicatat terpisah sebagai biaya yang dihindari — bukan penghematan dari pengeluaran saat ini — dan tidak dimasukkan ke angka-angka di atas.`
      : `If volume grows as you expect, manual work grows with it. The same automation absorbs part of those extra hours, so you don't have to hire to handle them. This is reported separately as cost avoided — not a saving on today's spend — and is not included in the figures above.`,
    rows,
    footnote: id
      ? `Asumsi: hanya jam tambahan akibat pertumbuhan yang dihitung (jam saat ini sudah ada di penghematan, jadi tidak dihitung dua kali); bagian yang diserap otomasi = celah otomasi × efisiensi ${eff}%; potongan realisasi ${realization}% karena nilai ini hanya terwujud bila pertumbuhannya benar-benar terjadi. 1 FTE = 2.080 jam/tahun.`
      : `Assumptions: only the extra hours from growth are counted (today's hours are already in the savings, so nothing is counted twice); the share automation absorbs = automation gap × ${eff}% efficiency; a ${realization}% realization discount applies because this value only materialises if the growth happens. 1 FTE = 2,080 h/yr.`,
  }
}
