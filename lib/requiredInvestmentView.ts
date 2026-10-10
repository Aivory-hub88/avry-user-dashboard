/**
 * Display model for "Your budget vs. the investment actually required" —
 * shared by the report page and the PDF so both show the same lines and the
 * same wording. Pure: formats figures already stored on `calculations` (the
 * required investment is computed in services/deepDiagnostic.ts).
 */
import type { RequiredInvestment } from '@/types/diagnostic'

type Locale = 'en' | 'id'

interface Calc {
  investmentBasis?: 'required' | 'stated_budget'
  requiredInvestment?: RequiredInvestment | null
  statedBudgetLocal?: number | null
  fxRateUsed?: number | null
  totalAnnualSavingsLocal?: number | null
}

export interface RequiredInvestmentView {
  explanation: string
  rows: { label: string; value: string; emphasis?: boolean; tone?: 'good' | 'bad' }[]
  footnote: string
}

const PLAN_NAME: Record<RequiredInvestment['plan'], string> = {
  operational: 'Operational',
  business: 'Business',
  enterprise: 'Enterprise',
}

export function isRequiredBasis(calc: Calc | null | undefined): boolean {
  return calc?.investmentBasis === 'required' && !!calc.requiredInvestment
}

export function buildRequiredInvestmentView(
  calc: Calc | null | undefined,
  fmt: (v: number) => string,
  locale: Locale = 'en',
): RequiredInvestmentView | null {
  if (!calc || !isRequiredBasis(calc)) return null
  const r = calc.requiredInvestment as RequiredInvestment
  const fx = calc.fxRateUsed ?? 1
  const L = (usd: number) => usd * fx
  const id = locale === 'id'
  const planName = PLAN_NAME[r.plan]
  const initial = L(r.initialUSD)
  const stated = calc.statedBudgetLocal ?? null
  const remaining = stated !== null ? stated - initial : null

  const hoursPerOpp = r.setupOpportunities > 0 ? Math.round(r.setupHours / r.setupOpportunities) : 0
  const rows: RequiredInvestmentView['rows'] = [
    {
      label: id ? 'Complete Transformation Package (sekali bayar)' : 'Complete Transformation Package (one-time)',
      value: fmt(L(r.packageUSD)),
    },
    {
      label: id
        ? `Plan ${planName} × ${r.planMonthsYear1} bulan (bulan pertama termasuk paket)${r.planPriceIsFloor ? ' — harga minimum' : ''}`
        : `${planName} plan × ${r.planMonthsYear1} months (first month included in the package)${r.planPriceIsFloor ? ' — minimum price' : ''}`,
      value: fmt(L(r.planMonthlyUSD * r.planMonthsYear1)),
    },
    {
      label: id
        ? `Setup & integrasi oleh tim Anda: ${r.setupHours} jam (${r.setupOpportunities} otomasi, ±${hoursPerOpp} jam/otomasi) × ${fmt(L(r.setupHourlyRateUSD))}/jam`
        : `Setup & integration by your team: ${r.setupHours} hours (${r.setupOpportunities} automations, ~${hoursPerOpp} h each) × ${fmt(L(r.setupHourlyRateUSD))}/hr`,
      value: fmt(L(r.setupUSD)),
    },
    {
      label: id ? 'Investasi yang dibutuhkan — tahun pertama' : 'Investment required — year 1',
      value: fmt(initial),
      emphasis: true,
    },
    {
      label: id ? `Biaya rutin mulai tahun ke-2 (Plan ${planName} 12 bulan)` : `Recurring from year 2 (${planName} plan, 12 months)`,
      value: `${fmt(L(r.annualRecurringUSD))}${id ? '/tahun' : '/yr'}`,
    },
  ]
  if (stated !== null) {
    rows.push({ label: id ? 'Anggaran yang Anda siapkan' : 'Budget you set aside', value: fmt(stated) })
    rows.push(remaining! >= 0
      ? { label: id ? 'Sisa anggaran' : 'Budget left over', value: fmt(remaining!), emphasis: true, tone: 'good' }
      : { label: id ? 'Kekurangan anggaran' : 'Budget shortfall', value: fmt(-remaining!), emphasis: true, tone: 'bad' })
  }

  let explanation: string
  if (stated === null) {
    explanation = id
      ? `Anda belum memasukkan anggaran, jadi laporan ini menghitung langsung investasi yang dibutuhkan untuk cakupan otomasi yang direkomendasikan: ≈ ${fmt(initial)} di tahun pertama. Semua angka keuangan di bawah dihitung dari angka ini.`
      : `No budget was entered, so this report prices the recommended automation scope directly: ≈ ${fmt(initial)} in year 1. Every financial figure below is calculated on that amount.`
  } else if (remaining! >= 0) {
    const share = Math.max(1, Math.round((initial / stated) * 100))
    explanation = id
      ? `Anda menyiapkan anggaran ${fmt(stated)}. Untuk cakupan otomasi yang direkomendasikan, investasi yang dibutuhkan dengan Aivory diperkirakan ${fmt(initial)} di tahun pertama — sekitar ${share}% dari anggaran Anda, jadi sisa ${fmt(remaining!)} tidak perlu dipakai untuk cakupan ini. Semua angka keuangan di bawah dihitung dari investasi yang dibutuhkan, bukan dari seluruh anggaran.`
      : `You set aside ${fmt(stated)}. For the recommended automation scope, the investment required with Aivory is an estimated ${fmt(initial)} in year 1 — about ${share}% of your budget, leaving ${fmt(remaining!)} unspent for this scope. Every financial figure below is calculated on the required investment, not on the whole budget.`
  } else {
    explanation = id
      ? `Anda menyiapkan anggaran ${fmt(stated)}, sedangkan investasi yang dibutuhkan untuk cakupan otomasi yang direkomendasikan diperkirakan ${fmt(initial)} di tahun pertama — kurang ${fmt(-remaining!)}. Pertimbangkan menjalankan otomasi berdampak tertinggi lebih dulu. Semua angka keuangan di bawah dihitung dari investasi yang dibutuhkan.`
      : `You set aside ${fmt(stated)}, while the recommended automation scope needs an estimated ${fmt(initial)} in year 1 — ${fmt(-remaining!)} short. Consider starting with the highest-impact automation first. Every financial figure below is calculated on the required investment.`
  }

  const footnote = id
    ? `Asumsi: harga paket dan plan sesuai harga publik Aivory; jam setup per otomasi menurut kerumitan (rendah 20, sedang 60, tinggi 160 jam), dihargai dengan biaya per jam yang sama dengan perhitungan penghematan.${r.planPriceIsFloor ? ' Plan Enterprise dihargai lewat tim sales — harga Business dipakai sebagai batas bawah.' : ''} Software pendukung di bagian rekomendasi software bersifat opsional (jika belum dimiliki) dan tidak termasuk.`
    : `Assumptions: package and plan at Aivory's published prices; setup hours per automation by complexity (low 20, medium 60, high 160), priced at the same hourly cost used for the savings.${r.planPriceIsFloor ? ' The Enterprise plan is sales-priced — the Business price is used as a floor.' : ''} Supporting software in the software recommendations is optional (if you don't already have it) and not included.`

  return { explanation, rows, footnote }
}
