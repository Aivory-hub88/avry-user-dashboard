/**
 * "The Aivory plan: what it is and who it is for" card on the Deep Diagnostic report.
 *
 * The running cost in the financial case is the Aivory subscription, and which plan is
 * priced is decided by a rule on the team-size answer (1-5 -> Operational, 6-200 ->
 * Business, >200 -> Enterprise). That choice can flip the whole case from positive to
 * negative, so the report shows the plans side by side with what each one would do to
 * the net result, instead of burying the choice in one sentence.
 *
 * Pure arithmetic over figures calculateROI() already stored: switching plan only
 * changes the plan price, so Net Annual Savings and NPV are shifted exactly (no
 * re-run, no FX drift against the numbers shown above).
 */
import type { RequiredInvestment } from '@/types/diagnostic'
import { TIER_MONTHLY_PRICE_USD, TIER_SEAT_LIMIT, TIER_CREDIT_ALLOWANCE } from '@/lib/tiers'

type Locale = 'en' | 'id'
type PlanId = RequiredInvestment['plan']

interface Calc {
  requiredInvestment?: RequiredInvestment | null
  investmentBasis?: 'required' | 'stated_budget'
  fxRateUsed?: number | null
  totalAnnualSavingsLocal?: number | null
  netAnnualSavingsLocal?: number | null
  ongoingCostStartYear?: number | null
}

export interface PlanCardRow {
  plan: PlanId
  name: string
  who: string
  includes: string
  price: string
  /** Net annual savings from year 2, if this plan were the one priced. */
  net: string | null
  netTone: 'good' | 'bad' | null
  /** Year-1 cash for this plan: package + setup + the plan months in year 1. */
  investment: string | null
  /** Years until cumulative net savings repay the year-1 investment, or "not reached". */
  payback: string
  paybackTone: 'good' | 'bad'
  used: boolean
}

export interface PlanCardView {
  heading: string
  whatItIs: string
  rows: PlanCardRow[]
  labels: { who: string; includes: string; price: string; net: string; investment: string; payback: string; used: string }
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
  const nf = (n: number) => n.toLocaleString(id ? 'id-ID' : 'en-US')

  const usedMonthlyLocal = r.planMonthlyUSD * fx
  const netUsed = calc.netAnnualSavingsLocal ?? null
  const totalSavings = calc.totalAnnualSavingsLocal ?? null
  const startYear = calc.ongoingCostStartYear ?? 2
  const initialUsed = r.initialUSD * fx

  const rowFor = (plan: PlanId): PlanCardRow => {
    const used = plan === r.plan
    const monthlyUSD = plan === 'enterprise' ? TIER_MONTHLY_PRICE_USD.business : TIER_MONTHLY_PRICE_USD[plan]
    const deltaM = usedMonthlyLocal - monthlyUSD * fx // positive when this plan is cheaper
    const net = netUsed === null ? null : netUsed + 12 * deltaM
    const investment = initialUsed - deltaM * r.planMonthsYear1
    // Same closed form as calculateROI's netBreakEvenYears: year 1 carries no running
    // cost (its plan months are inside the investment), years startYear.. do.
    let years: number | null = null
    if (totalSavings !== null && net !== null && totalSavings > 0) {
      if (totalSavings >= investment) years = investment / totalSavings
      else if (net > 0) years = (startYear - 1) + (investment - totalSavings) / net
    }
    const payback = years === null
      ? (id ? 'Tidak tercapai' : 'Not reached')
      : `${years.toFixed(1)} ${id ? 'tahun' : 'years'}`
    const tone = (v: number | null) => (v === null ? null : v >= 0 ? ('good' as const) : ('bad' as const))
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
      net: net === null ? null : fmt(net), netTone: tone(net),
      investment: fmt(investment),
      payback, paybackTone: years === null ? 'bad' : 'good',
      used,
    }
  }

  // Enterprise is sales-priced, so it is only shown when it is the plan actually used.
  const plans: PlanId[] = r.plan === 'enterprise' ? ['operational', 'business', 'enterprise'] : ['operational', 'business']

  const whatItIs = id
    ? 'Plan Aivory adalah langganan bulanan yang menjalankan otomasi Anda setelah paket sekali bayar. Ini satu-satunya biaya berulang yang dihitung di laporan ini (software pendukung opsional tidak termasuk). Paket sudah mencakup bulan pertama, jadi tahun pertama membawa ' +
      `${r.planMonthsYear1} bulan dan mulai tahun ke-2 menjadi 12 bulan.`
    : 'The Aivory plan is the monthly subscription that runs your automations after the one-time package. It is the only recurring cost counted in this report (optional supporting software is not included). The package covers the first month, so year 1 carries ' +
      `${r.planMonthsYear1} months and from year 2 it is 12 months.`

  const how = r.planAssumed
    ? (id ? 'Ukuran tim tidak diisi, jadi plan awal (Operational) diasumsikan.' : 'Your team size was not given, so the entry plan (Operational) is assumed.')
    : (id
        ? 'Laporan ini memilih plan dari jumlah karyawan yang pekerjaannya diotomasi (1–5 Operational, 6–200 Business, di atas 200 Enterprise).'
        : 'This report picks the plan from how many employees\' work is automated (1–5 Operational, 6–200 Business, over 200 Enterprise).')
  const caveat = id
    ? `${how} Itu perkiraan: yang sebenarnya menentukan plan adalah berapa orang yang memakai Aivory dan seberapa banyak ia berjalan, bukan jumlah karyawan yang pekerjaannya terbantu. Jika satu orang yang mengoperasikan agen, Operational bisa cukup. Bandingkan kartu di atas: pilihan plan mengubah hasil bersihnya.`
    : `${how} That is an estimate: what really decides the plan is how many people use Aivory and how much it runs, not how many employees' work it helps. If one person will operate the agents, Operational may be enough. Compare the cards above: the plan choice changes the net result.`

  return {
    heading: id ? 'Plan Aivory: apa itu dan untuk siapa' : 'The Aivory plan: what it is and who it is for',
    whatItIs,
    rows: plans.map(rowFor),
    labels: id
      ? { who: 'Untuk siapa', includes: 'Isi', price: 'Harga', net: 'Penghematan bersih/tahun (dari tahun ke-2)', investment: 'Investasi tahun pertama', payback: 'Payback dari penghematan bersih', used: 'Dipakai di laporan ini' }
      : { who: 'Who it is for', includes: 'Includes', price: 'Price', net: 'Net annual savings (from year 2)', investment: 'Year-1 investment', payback: 'Payback on net savings', used: 'Used in this report' },
    caveat,
  }
}
