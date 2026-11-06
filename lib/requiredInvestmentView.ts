/**
 * Display model for "Your budget vs. the investment actually required" —
 * shared by the report page and the PDF so both show the same lines and the
 * same wording. Pure: formats figures already stored on `calculations` (the
 * required investment is computed in services/deepDiagnostic.ts).
 */
import type { RequiredInvestment } from '@/types/diagnostic'
import { TIER_SEAT_LIMIT, TIER_CREDIT_ALLOWANCE } from '@/lib/tiers'

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
  /** What the Aivory plan is, what it includes, and why this plan is the one priced. */
  planNote?: string
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
  const assumed = r.planAssumed === true
  const assumedTag = assumed ? (id ? ' — diasumsikan, ukuran tim tidak diisi' : ' — assumed, team size not given') : ''
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
        ? `Plan ${planName} × ${r.planMonthsYear1} bulan (bulan pertama termasuk paket)${r.planPriceIsFloor ? ' — harga minimum' : ''}${assumedTag}`
        : `${planName} plan × ${r.planMonthsYear1} months (first month included in the package)${r.planPriceIsFloor ? ' — minimum price' : ''}${assumedTag}`,
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
      label: id ? `Biaya rutin mulai tahun ke-2 (Plan ${planName} 12 bulan)${assumedTag}` : `Recurring from year 2 (${planName} plan, 12 months)${assumedTag}`,
      value: `${fmt(L(r.annualRecurringUSD))}${id ? '/tahun' : '/yr'}`,
    },
  ]
  if (stated !== null) {
    rows.push({ label: id ? 'Anggaran yang Anda siapkan' : 'Budget you set aside', value: fmt(stated) })
    // A positive remainder is deliberately NOT shown as a line: "budget left over"
    // next to a net-negative case read as good news that the numbers below contradict.
    if (remaining! < 0) {
      rows.push({ label: id ? 'Kekurangan anggaran' : 'Budget shortfall', value: fmt(-remaining!), emphasis: true, tone: 'bad' })
    }
  }

  let explanation: string
  if (stated === null) {
    explanation = id
      ? `Anda belum memasukkan anggaran, jadi laporan ini menghitung langsung investasi yang dibutuhkan untuk cakupan otomasi yang direkomendasikan: ≈ ${fmt(initial)} di tahun pertama. Semua angka keuangan di bawah dihitung dari angka ini.`
      : `No budget was entered, so this report prices the recommended automation scope directly: ≈ ${fmt(initial)} in year 1. Every financial figure below is calculated on that amount.`
  } else if (remaining! >= 0) {
    explanation = id
      ? `Anda menyiapkan anggaran ${fmt(stated)}. Cakupan otomasi yang direkomendasikan membutuhkan sekitar ${fmt(initial)} di tahun pertama, jadi masih dalam anggaran. Anggaran adalah batas atas, bukan biaya proyek: semua angka keuangan di bawah dihitung dari investasi yang dibutuhkan. Muat dalam anggaran belum berarti cakupan ini balik modal; angka penghematan dan angka bersih di bawah yang menunjukkannya.`
      : `You set aside ${fmt(stated)}. The recommended automation scope needs an estimated ${fmt(initial)} in year 1, which fits within it. Your budget is a ceiling, not the cost of the project: every financial figure below is calculated on the required investment. Fitting the budget does not mean the scope pays back; the savings and net figures below show that.`
  } else {
    explanation = id
      ? `Anda menyiapkan anggaran ${fmt(stated)}, sedangkan investasi yang dibutuhkan untuk cakupan otomasi yang direkomendasikan diperkirakan ${fmt(initial)} di tahun pertama — kurang ${fmt(-remaining!)}. Pertimbangkan menjalankan otomasi berdampak tertinggi lebih dulu. Semua angka keuangan di bawah dihitung dari investasi yang dibutuhkan.`
      : `You set aside ${fmt(stated)}, while the recommended automation scope needs an estimated ${fmt(initial)} in year 1 — ${fmt(-remaining!)} short. Consider starting with the highest-impact automation first. Every financial figure below is calculated on the required investment.`
  }

  const nf = (n: number) => n.toLocaleString(id ? 'id-ID' : 'en-US')
  const monthly = `${fmt(L(r.planMonthlyUSD))}${id ? '/bulan' : '/month'} (US$${r.planMonthlyUSD})`
  const seats = TIER_SEAT_LIMIT[r.plan]
  const credits = TIER_CREDIT_ALLOWANCE[r.plan]
  const includes = r.plan === 'enterprise'
    ? ''
    : id
      ? ` mencakup hingga ${seats} kursi tim dan ${nf(credits)} Intelligence Credit per bulan`
      : ` includes up to ${seats} team seat${seats > 1 ? 's' : ''} and ${nf(credits)} Intelligence Credits per month`
  const reason = assumed
    ? (id ? 'Ukuran tim tidak diisi, jadi plan awal diasumsikan.' : 'Your team size was not given, so the entry plan is assumed.')
    : r.plan === 'operational'
      ? (id ? 'Plan Operational sesuai untuk 1–5 karyawan dalam cakupan.' : 'The Operational plan fits 1–5 employees in scope.')
      : r.plan === 'business'
        ? (id ? 'Plan Business sesuai untuk 6–200 karyawan dalam cakupan.' : 'The Business plan fits 6–200 employees in scope.')
        : (id ? 'Lebih dari 200 karyawan dalam cakupan; Enterprise dihargai lewat tim sales, jadi harga Business dipakai sebagai batas bawah.' : 'More than 200 employees are in scope; Enterprise is priced by sales, so the Business price is used as a floor.')
  const planNote = id
    ? `Apa itu plan Aivory: langganan bulanan yang menjalankan otomasi Anda setelah paket sekali bayar. Plan ${planName} (${monthly})${includes}. Ini satu-satunya biaya berulang yang dihitung di laporan ini — software pendukung opsional tidak termasuk. Paket sudah mencakup bulan pertama, jadi tahun pertama membawa ${r.planMonthsYear1} bulan, dan mulai tahun ke-2 menjadi 12 bulan (${fmt(L(r.annualRecurringUSD))} per tahun). ${reason}`
    : `What the Aivory plan is: the monthly subscription that runs your automations after the one-time package. The ${planName} plan (${monthly})${includes}. It is the only recurring cost counted in this report — optional supporting software is not included. The package covers the first month, so year 1 carries ${r.planMonthsYear1} months, and from year 2 it is 12 months (${fmt(L(r.annualRecurringUSD))} per year). ${reason}`

  const footnote = id
    ? `Asumsi: harga paket dan plan sesuai harga publik Aivory; jam setup per otomasi menurut kerumitan (rendah 20, sedang 60, tinggi 160 jam), dihargai dengan biaya per jam yang sama dengan perhitungan penghematan.${r.planPriceIsFloor ? ' Plan Enterprise dihargai lewat tim sales — harga Business dipakai sebagai batas bawah.' : ''} Software pendukung di bagian rekomendasi software bersifat opsional (jika belum dimiliki) dan tidak termasuk.${assumed ? ' Ukuran tim tidak diisi, jadi plan Operasional diasumsikan; jika lebih dari 5 karyawan masuk cakupan, plan Business berlaku dan angka bersih di bawah akan berubah.' : ''}`
    : `Assumptions: package and plan at Aivory's published prices; setup hours per automation by complexity (low 20, medium 60, high 160), priced at the same hourly cost used for the savings.${r.planPriceIsFloor ? ' The Enterprise plan is sales-priced — the Business price is used as a floor.' : ''} Supporting software in the software recommendations is optional (if you don't already have it) and not included.${assumed ? ' Team size was not provided, so the Operational plan is assumed; if more than 5 employees are in scope, the Business plan applies and the net figures below change.' : ''}`

  return { explanation, rows, planNote, footnote }
}
