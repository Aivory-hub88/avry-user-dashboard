/**
 * "Recommended Aivory plan" card on the Deep Diagnostic report.
 *
 * The Financial Case values the automation scope against the one-time investment
 * (Complete Transformation Package + the team's setup time). The Aivory subscription
 * is NOT part of those figures: it is a recommendation, shown here with who each plan
 * is for, what it includes, what it costs per year, and what is left of the yearly
 * value created if you also count it, so the reader can judge the fit.
 *
 * Reports stored before 2026-11-06 still carry the plan inside their figures
 * (annualRecurringUSD > 0); for those the card says so instead of claiming otherwise.
 *
 * Pure arithmetic over figures calculateROI() already stored.
 */
import type { RequiredInvestment } from '@/types/diagnostic'
import { TIER_MONTHLY_PRICE_USD, TIER_SEAT_LIMIT, TIER_CREDIT_ALLOWANCE } from '@/lib/tiers'

type Locale = 'en' | 'id'
type PlanId = RequiredInvestment['plan']

interface Calc {
  requiredInvestment?: RequiredInvestment | null
  investmentBasis?: 'required' | 'stated_budget'
  fxRateUsed?: number | null
  /** Business Value Created per year (local currency). */
  totalAnnualSavingsLocal?: number | null
}

export interface PlanCardRow {
  plan: PlanId
  name: string
  who: string
  includes: string
  price: string
  /** What the plan costs per year. */
  yearly: string
  /** Value created per year minus this plan's yearly cost. */
  kept: string | null
  keptTone: 'good' | 'bad' | null
  recommended: boolean
}

export interface PlanCardView {
  heading: string
  /** One sentence: which plan, and why. */
  recommendation: string
  whatItIs: string
  rows: PlanCardRow[]
  labels: { who: string; includes: string; price: string; yearly: string; kept: string; recommended: string }
  caveat: string
}

const NAME: Record<PlanId, string> = { operational: 'Operational', business: 'Business', enterprise: 'Enterprise' }

export function buildPlanComparison(
  calc: Calc | null | undefined,
  fmt: (v: number) => string,
  locale: Locale = 'en',
): PlanCardView | null {
  if (!calc || calc.investmentBasis !== 'required' || !calc.requiredInvestment) return null
  const r = calc.requiredInvestment
  const id = locale === 'id'
  const fx = calc.fxRateUsed ?? 1
  const value = calc.totalAnnualSavingsLocal ?? null
  const planInFigures = r.annualRecurringUSD > 0 // legacy stored report
  const nf = (n: number) => n.toLocaleString(id ? 'id-ID' : 'en-US')

  // The team-size rule can match a plan that costs more per year than the whole scope creates.
  // Recommending a plan that wipes out the value would repeat the contradiction this card exists
  // to remove, so step down to Operational in that case (and say when to move up).
  const yearlyOf = (plan: PlanId) =>
    (plan === 'enterprise' ? TIER_MONTHLY_PRICE_USD.business : TIER_MONTHLY_PRICE_USD[plan]) * 12 * fx
  const steppedDown =
    r.plan === 'business' && value !== null && yearlyOf('business') > value && yearlyOf('operational') <= value
  const recPlan: PlanId = steppedDown ? 'operational' : r.plan

  const rowFor = (plan: PlanId): PlanCardRow => {
    const monthlyUSD = plan === 'enterprise' ? TIER_MONTHLY_PRICE_USD.business : TIER_MONTHLY_PRICE_USD[plan]
    const yearlyLocal = monthlyUSD * 12 * fx
    const kept = value === null ? null : value - yearlyLocal
    const seats = TIER_SEAT_LIMIT[plan]
    const credits = TIER_CREDIT_ALLOWANCE[plan]
    const who =
      plan === 'operational'
        ? (id ? '1 orang (1 kursi)' : '1 person (1 seat)')
        : plan === 'business'
          ? (id ? `Tim hingga ${seats} orang (${seats} kursi)` : `A team of up to ${seats} people (${seats} seats)`)
          : (id ? `${seats}+ orang, lewat kontrak` : `${seats}+ people, by contract`)
    const includes =
      plan === 'enterprise'
        ? (id ? 'Kuota khusus sesuai kontrak' : 'Custom allowance by contract')
        : (id ? `${nf(credits)} Intelligence Credit per bulan` : `${nf(credits)} Intelligence Credits per month`)
    const price =
      plan === 'enterprise'
        ? (id ? `Dihargai tim sales (batas bawah ${fmt(monthlyUSD * fx)}/bulan)` : `Priced by sales (floor ${fmt(monthlyUSD * fx)}/month)`)
        : `${fmt(monthlyUSD * fx)}${id ? '/bulan' : '/month'} (US$${monthlyUSD})`
    return {
      plan, name: NAME[plan], who, includes, price,
      yearly: `${fmt(yearlyLocal)}${id ? '/tahun' : '/year'}`,
      kept: kept === null ? null : fmt(kept),
      keptTone: kept === null ? null : kept >= 0 ? 'good' : 'bad',
      recommended: plan === recPlan,
    }
  }

  // Enterprise is sales-priced, so it is only shown when it is the plan recommended.
  const plans: PlanId[] = r.plan === 'enterprise' ? ['operational', 'business', 'enterprise'] : ['operational', 'business']

  const reason = steppedDown ? '' : r.planAssumed
    ? (id ? 'ukuran tim tidak diisi, jadi plan awal yang diasumsikan' : 'your team size was not given, so the entry plan is assumed')
    : r.plan === 'operational'
      ? (id ? 'sesuai untuk 1–5 karyawan dalam cakupan' : 'it fits 1–5 employees in scope')
      : r.plan === 'business'
        ? (id ? 'sesuai untuk 6–200 karyawan dalam cakupan' : 'it fits 6–200 employees in scope')
        : (id ? 'lebih dari 200 karyawan dalam cakupan; Enterprise dihargai lewat tim sales' : 'more than 200 employees are in scope; Enterprise is priced by sales')
  const recommendation = steppedDown
    ? (id
        ? `Kami merekomendasikan plan Operational: plan Business (yang sesuai dengan ukuran tim Anda) akan memakan ${fmt(yearlyOf('business'))} per tahun, lebih besar dari nilai ${fmt(value as number)} per tahun yang dihasilkan cakupan ini. Naik ke Business saat lebih banyak orang butuh akses atau pemakaian bertambah.`
        : `We recommend the Operational plan: the Business plan (the match for your team size) would cost ${fmt(yearlyOf('business'))} a year, more than the ${fmt(value as number)} a year this scope creates. Move up to Business when more people need access or usage grows.`)
    : (id
        ? `Kami merekomendasikan plan ${NAME[recPlan]}: ${reason}.`
        : `We recommend the ${NAME[recPlan]} plan: ${reason}.`)

  const whatItIs = id
    ? 'Plan Aivory adalah langganan bulanan yang menjalankan otomasi Anda setelah paket sekali bayar. Paket sudah mencakup bulan pertama.'
    : 'The Aivory plan is the monthly subscription that runs your automations after the one-time package. The package already covers the first month.'

  const scope = planInFigures
    ? (id ? 'Pada laporan ini biaya plan sudah dihitung di biaya berjalan dan angka bersih di atas.' : 'In this report the plan cost is already counted in the running cost and the net figures above.')
    : (id ? 'Biaya plan tidak termasuk dalam angka Financial Case (yang hanya mencakup paket sekali bayar dan waktu setup tim). Plan ditampilkan sebagai rekomendasi supaya Anda bisa menilai kecocokannya: bandingkan biaya per tahun dengan nilai yang dihasilkan.'
        : 'The plan cost is not part of the Financial Case figures (those cover the one-time package and your team\'s setup time). It is shown as a recommendation so you can judge the fit: compare the yearly cost with the value created.')
  const how = id
    ? 'Plan dipilih dari jumlah karyawan yang pekerjaannya diotomasi (1–5 Operational, 6–200 Business, di atas 200 Enterprise). Itu perkiraan: yang sebenarnya menentukan plan adalah berapa orang yang memakai Aivory dan seberapa banyak ia berjalan. Jika satu orang yang mengoperasikan agen, Operational bisa cukup.'
    : 'The plan is picked from how many employees\' work is automated (1–5 Operational, 6–200 Business, over 200 Enterprise). That is an estimate: what really decides the plan is how many people use Aivory and how much it runs. If one person will operate the agents, Operational may be enough.'

  return {
    heading: id ? 'Rekomendasi plan Aivory' : 'Recommended Aivory plan',
    recommendation,
    whatItIs,
    rows: plans.map(rowFor),
    labels: id
      ? { who: 'Untuk siapa', includes: 'Isi', price: 'Harga', yearly: 'Biaya per tahun', kept: 'Nilai per tahun setelah dikurangi plan', recommended: 'Direkomendasikan' }
      : { who: 'Who it is for', includes: 'Includes', price: 'Price', yearly: 'Cost per year', kept: 'Yearly value left after the plan', recommended: 'Recommended' },
    caveat: `${scope} ${how}`,
  }
}
