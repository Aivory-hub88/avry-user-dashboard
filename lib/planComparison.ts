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
import { planForTeam } from '@/lib/planForTeam'

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
  /** This plan's yearly cost as a share of the yearly value the scope creates (value stays positive; the plan is the cost). */
  share: string | null
  shareTone: 'good' | 'bad' | null
  recommended: boolean
}

export interface PlanCardView {
  heading: string
  /** One sentence: which plan, and why. */
  recommendation: string
  /** What delivering the automation with Aivory costs: the one-time package plus the plan. */
  optionLine: string
  /** The value the scope creates per year (from the Financial Case), stated once, plainly. */
  valueLine: string | null
  whatItIs: string
  rows: PlanCardRow[]
  labels: { who: string; includes: string; price: string; yearly: string; share: string; recommended: string }
  caveat: string
}

const NAME: Record<PlanId, string> = { operational: 'Operational', business: 'Business', enterprise: 'Enterprise' }

export function buildPlanComparison(
  calc: Calc | null | undefined,
  fmt: (v: number) => string,
  locale: Locale = 'en',
  /** The team as stored on the report; when given the plan follows the current rule even for older reports. */
  team?: { companySize?: string | null; fte?: number | null },
): PlanCardView | null {
  if (!calc || calc.investmentBasis !== 'required' || !calc.requiredInvestment) return null
  const r = calc.requiredInvestment
  const id = locale === 'id'
  const fx = calc.fxRateUsed ?? 1
  const value = calc.totalAnnualSavingsLocal ?? null
  const planInFigures = r.annualRecurringUSD > 0 // legacy stored report
  const nf = (n: number) => n.toLocaleString(id ? 'id-ID' : 'en-US')

  const yearlyOf = (plan: PlanId) =>
    (plan === 'enterprise' ? TIER_MONTHLY_PRICE_USD.business : TIER_MONTHLY_PRICE_USD[plan]) * 12 * fx
  const team_ = team ? planForTeam(team.fte ?? null, team.companySize ?? null) : { plan: r.plan as PlanId, assumed: r.planAssumed === true }
  const recPlan: PlanId = team_.plan
  const assumed = team_.assumed

  const rowFor = (plan: PlanId): PlanCardRow => {
    const monthlyUSD = plan === 'enterprise' ? TIER_MONTHLY_PRICE_USD.business : TIER_MONTHLY_PRICE_USD[plan]
    const yearlyLocal = monthlyUSD * 12 * fx
    const salesPriced = plan === 'enterprise'
    const sharePct = !salesPriced && value !== null && value > 0 ? Math.round((yearlyLocal / value) * 100) : null
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
      yearly: salesPriced
        ? (id ? 'Dihargai tim sales' : 'Priced by sales')
        : `${fmt(yearlyLocal)}${id ? '/tahun' : '/year'}`,
      share: sharePct === null ? null : (id ? `${sharePct}% dari nilai per tahun` : `${sharePct}% of the yearly value`),
      shareTone: sharePct === null ? null : sharePct > 100 ? 'bad' : 'good',
      recommended: plan === recPlan,
    }
  }

  // Solo: Operational (and Business as the step up). A team: Business and Enterprise.
  const plans: PlanId[] = recPlan === 'operational' ? ['operational', 'business'] : ['business', 'enterprise']

  const seatsBusiness = TIER_SEAT_LIMIT.business
  const seatsEnterprise = TIER_SEAT_LIMIT.enterprise
  const recommendation =
    recPlan === 'operational'
      ? (assumed
          ? (id ? 'Kami merekomendasikan plan Operational: ukuran tim tidak diketahui, jadi plan awal yang diasumsikan. Jika lebih dari satu orang yang memakai Aivory, pilih Business atau Enterprise.'
                : 'We recommend the Operational plan: your team size is not known, so the entry plan is assumed. If more than one person will use Aivory, choose Business or Enterprise.')
          : (id ? 'Kami merekomendasikan plan Operational: Anda bekerja sendiri, dan plan ini untuk satu orang (1 kursi).'
                : 'We recommend the Operational plan: you work on your own, and it is built for one person (1 seat).'))
      : recPlan === 'business'
        ? (id ? `Kami merekomendasikan plan Business: tim Anda lebih dari satu orang, dan plan ini mencakup hingga ${seatsBusiness} kursi. Jika lebih dari ${seatsBusiness} orang akan memakai Aivory, pilihannya Enterprise (${seatsEnterprise}+ kursi, lewat kontrak).`
              : `We recommend the Business plan: your team is more than one person, and it covers up to ${seatsBusiness} seats. If more than ${seatsBusiness} people will use Aivory, the option is Enterprise (${seatsEnterprise}+ seats, by contract).`)
        : (id ? 'Kami merekomendasikan plan Enterprise: lebih dari 200 karyawan dalam cakupan, jadi kursi dan kuota disepakati lewat kontrak. Harga ditentukan tim sales; harga Business ditampilkan sebagai batas bawah. Business adalah titik awal bila kebutuhannya lebih kecil.'
              : 'We recommend the Enterprise plan: more than 200 employees are in scope, so seats and allowance are agreed by contract. Enterprise is priced by sales; the Business price is shown as a floor. Business is the starting point if the need is smaller.')

  const whatItIs = id
    ? 'Plan Aivory adalah langganan bulanan yang menjalankan otomasi Anda setelah paket sekali bayar. Paket sudah mencakup bulan pertama.'
    : 'The Aivory plan is the monthly subscription that runs your automations after the one-time package. The package already covers the first month.'

  const pkgLocal = r.packageUSD * fx
  const recYearly = recPlan === 'enterprise' ? null : yearlyOf(recPlan)
  const optionLine = id
    ? `Jika dikerjakan dengan Aivory: Complete Transformation Package ${fmt(pkgLocal)} (sekali bayar, sudah mencakup bulan pertama)${recYearly === null ? ', ditambah plan Enterprise yang dihargai tim sales' : `, lalu plan ${NAME[recPlan]} ${fmt(recYearly)} per tahun`}.`
    : `If you deliver it with Aivory: the Complete Transformation Package ${fmt(pkgLocal)} (one-time, covers the first month)${recYearly === null ? ', plus the Enterprise plan, priced by sales' : `, then the ${NAME[recPlan]} plan at ${fmt(recYearly)} a year`}.`

  const transformation = r.costModel === 'transformation'
  const scope = transformation
    ? (id ? 'Biaya Aivory ini tidak termasuk dalam angka Financial Case di atas (yang mencakup usaha setup tim Anda dan software yang direkomendasikan laporan). Aivory adalah salah satu cara mengerjakan otomasinya: bandingkan biaya per tahun dengan nilai yang dihasilkan.'
          : "These Aivory costs are not part of the Financial Case figures above (those cover your team's own setup effort and the software the report recommends). Aivory is one way to deliver the automation: compare the yearly cost with the value created.")
    : planInFigures
    ? (id ? 'Pada laporan ini biaya plan sudah dihitung di biaya berjalan dan angka bersih di atas.' : 'In this report the plan cost is already counted in the running cost and the net figures above.')
    : (id ? 'Biaya plan tidak termasuk dalam angka Financial Case (yang hanya mencakup paket sekali bayar dan waktu setup tim). Plan ditampilkan sebagai rekomendasi supaya Anda bisa menilai kecocokannya: bandingkan biaya per tahun dengan nilai yang dihasilkan.'
        : 'The plan cost is not part of the Financial Case figures (those cover the one-time package and your team\'s setup time). It is shown as a recommendation so you can judge the fit: compare the yearly cost with the value created.')
  const how = id
    ? 'Plan dipilih dari ukuran perusahaan Anda: bekerja sendiri Operational (1 kursi); lebih dari satu orang Business atau Enterprise, dan Enterprise untuk lebih dari 200 karyawan dalam cakupan. Itu perkiraan: yang sebenarnya menentukan plan adalah berapa orang yang memakai Aivory dan seberapa banyak ia berjalan.'
    : 'The plan is picked from your company size: working alone Operational (1 seat); more than one person Business or Enterprise, with Enterprise above 200 employees in scope. That is an estimate: what really decides the plan is how many people use Aivory and how much it runs.'

  return {
    heading: id ? 'Mengerjakannya dengan Aivory: salah satu opsi' : 'Delivering it with Aivory: one option',
    recommendation,
    optionLine,
    valueLine: value === null ? null : (id ? `Nilai yang dihasilkan cakupan ini: ${fmt(value)} per tahun (dari Financial Case).` : `Value this scope creates: ${fmt(value)} per year (from the Financial Case).`),
    whatItIs,
    rows: plans.map(rowFor),
    labels: id
      ? { who: 'Untuk siapa', includes: 'Isi', price: 'Harga', yearly: 'Biaya per tahun', share: 'Biaya plan dibanding nilai itu', recommended: 'Direkomendasikan' }
      : { who: 'Who it is for', includes: 'Includes', price: 'Price', yearly: 'Cost per year', share: 'Plan cost compared with that value', recommended: 'Recommended' },
    caveat: `${scope} ${how}`,
  }
}
