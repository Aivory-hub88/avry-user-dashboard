/**
 * Display model for "Your budget vs. the investment actually required" —
 * shared by the report page and the PDF so both show the same lines and the
 * same wording. Pure: formats figures already stored on `calculations` (the
 * required investment is computed in services/deepDiagnostic.ts).
 *
 * Three generations of stored reports exist:
 *  - costModel 'transformation' (current): the user's own setup effort + the recommended
 *    software priced for a whole team; things that cannot be priced without inventing a
 *    number are listed as not priced. The Aivory package and plan are one delivery option,
 *    shown by the plan card, not part of these figures.
 *  - before: Aivory package + setup (2026-11-06 to the transformation model);
 *  - before that: package + setup + the Aivory plan inside the figures.
 * Stored reports are re-priced when opened (upgradeDiagnosticContext), so the older two
 * only render for a report that could not be upgraded.
 */
import type { RequiredInvestment } from '@/types/diagnostic'
import { buildPlanComparison } from '@/lib/planComparison'

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
  /** What the report recommends but does not price, and why (so no number is invented). */
  unpricedNote?: string
  /** For the PDF: the Aivory delivery option as one short paragraph (the page renders the full card). */
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

const BASIS_REASON: Record<string, { en: string; id: string }> = {
  per_user: { en: 'priced per user', id: 'harga per pengguna' },
  per_employee: { en: 'priced per employee', id: 'harga per karyawan' },
  per_location: { en: 'priced per outlet', id: 'harga per outlet' },
  transaction_fee: { en: 'a per-transaction fee', id: 'biaya per transaksi' },
  usage: { en: 'metered by usage', id: 'berdasarkan pemakaian' },
  quote: { en: 'priced on quote', id: 'harga lewat kuotasi' },
}

function unpricedNoteFor(r: RequiredInvestment, id: boolean): string | undefined {
  const items = r.unpriced ?? []
  if (items.length === 0) return undefined
  const sw = items.filter((i) => i.kind === 'software')
  const tr = items.filter((i) => i.kind === 'training')
  const dp = items.filter((i) => i.kind === 'data_prep')
  const parts: string[] = []
  if (sw.length) {
    const list = sw.map((i) => `${i.title} (${BASIS_REASON[i.basis ?? '']?.[id ? 'id' : 'en'] ?? (id ? 'tanpa harga tim' : 'no team price')})`).join(', ')
    parts.push(id ? `software yang harganya butuh jumlah pengguna atau kuotasi vendor: ${list}` : `software that needs a seat count or a vendor quote: ${list}`)
  }
  if (tr.length) parts.push(id ? `pelatihan untuk ${tr.map((i) => i.title).join(', ')}` : `training for ${tr.map((i) => i.title).join(', ')}`)
  if (dp.length) parts.push(id ? `persiapan data dan proses sebelum ${dp.map((i) => i.title).join(', ')}` : `data and process preparation before ${dp.map((i) => i.title).join(', ')}`)
  return id
    ? `Belum diberi harga di angka ini (karena butuh data yang tidak kami miliki, dan kami tidak mengarang angka): ${parts.join('; ')}.`
    : `Not priced in these figures (each needs information the report does not have, and no number is invented): ${parts.join('; ')}.`
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
  const transformation = r.costModel === 'transformation'
  // Older stored reports: the plan inside the figures (plan months in year 1, a recurring cost from year 2)
  const planInFigures = !transformation && r.annualRecurringUSD > 0
  const assumed = r.planAssumed === true
  const assumedTag = assumed ? (id ? ' — diasumsikan, ukuran tim tidak diisi' : ' — assumed, team size not given') : ''
  const initial = L(r.initialUSD)
  const stated = calc.statedBudgetLocal ?? null
  const remaining = stated !== null ? stated - initial : null

  const hoursPerOpp = r.setupOpportunities > 0 ? Math.round(r.setupHours / r.setupOpportunities) : 0
  const setupRow = {
    label: id
      ? `Setup & integrasi oleh tim Anda: ${r.setupHours} jam (${r.setupOpportunities} otomasi, ±${hoursPerOpp} jam/otomasi) × ${fmt(L(r.setupHourlyRateUSD))}/jam`
      : `Setup & integration by your team: ${r.setupHours} hours (${r.setupOpportunities} automations, ~${hoursPerOpp} h each) × ${fmt(L(r.setupHourlyRateUSD))}/hr`,
    value: fmt(L(r.setupUSD)),
  }
  const totalRow = {
    label: id ? 'Investasi yang dibutuhkan — tahun pertama' : 'Investment required — year 1',
    value: fmt(initial),
    emphasis: true,
  }
  const pricedSoftware = (r.softwareLines ?? []).filter((l) => l.annualUSD !== null)

  const rows: RequiredInvestmentView['rows'] = []
  if (transformation) {
    rows.push(setupRow)
    for (const l of pricedSoftware) {
      rows.push({
        label: id ? `${l.name} (${l.category.id}) — paket tim, 12 bulan` : `${l.name} (${l.category.en}) — team plan, 12 months`,
        value: fmt(L(l.annualUSD as number)),
      })
    }
    rows.push(totalRow)
    if (r.annualRecurringUSD > 0) {
      rows.push({
        label: id ? 'Biaya rutin mulai tahun ke-2 (software yang direkomendasikan)' : 'Recurring from year 2 (recommended software)',
        value: `${fmt(L(r.annualRecurringUSD))}${id ? '/tahun' : '/yr'}`,
      })
    }
  } else {
    rows.push({
      label: id ? 'Complete Transformation Package (sekali bayar)' : 'Complete Transformation Package (one-time)',
      value: fmt(L(r.packageUSD)),
    })
    if (planInFigures) {
      rows.push({
        label: id
          ? `Plan ${planName} × ${r.planMonthsYear1} bulan (bulan pertama termasuk paket)${r.planPriceIsFloor ? ' — harga minimum' : ''}${assumedTag}`
          : `${planName} plan × ${r.planMonthsYear1} months (first month included in the package)${r.planPriceIsFloor ? ' — minimum price' : ''}${assumedTag}`,
        value: fmt(L(r.planMonthlyUSD * r.planMonthsYear1)),
      })
    }
    rows.push(setupRow, totalRow)
    if (planInFigures) {
      rows.push({
        label: id ? `Biaya rutin mulai tahun ke-2 (Plan ${planName} 12 bulan)${assumedTag}` : `Recurring from year 2 (${planName} plan, 12 months)${assumedTag}`,
        value: `${fmt(L(r.annualRecurringUSD))}${id ? '/tahun' : '/yr'}`,
      })
    }
  }
  if (stated !== null) {
    rows.push({ label: id ? 'Anggaran yang Anda siapkan' : 'Budget you set aside', value: fmt(stated) })
    // A positive remainder is deliberately NOT shown as a line: "budget left over"
    // next to a net-negative case read as good news that the numbers below contradict.
    if (remaining! < 0) {
      rows.push({ label: id ? 'Kekurangan anggaran' : 'Budget shortfall', value: fmt(-remaining!), emphasis: true, tone: 'bad' })
    }
  }

  const basisNote = transformation
    ? (pricedSoftware.length > 0
        ? (id ? ' (usaha setup tim Anda ditambah software yang direkomendasikan, yang harganya per tim)' : " (your team's setup effort plus the recommended software priced as team plans)")
        : (id ? ' (usaha setup tim Anda)' : " (your team's setup effort)"))
    : planInFigures ? '' : (id ? ' (paket sekali bayar ditambah waktu setup tim Anda)' : " (the one-time package plus your team's setup time)")
  let explanation: string
  if (stated === null) {
    explanation = id
      ? `Anda belum memasukkan anggaran, jadi laporan ini menghitung langsung investasi yang dibutuhkan untuk cakupan otomasi yang direkomendasikan: ≈ ${fmt(initial)} di tahun pertama${basisNote}. Semua angka keuangan di bawah dihitung dari angka ini.`
      : `No budget was entered, so this report prices the recommended automation scope directly: ≈ ${fmt(initial)} in year 1${basisNote}. Every financial figure below is calculated on that amount.`
  } else if (remaining! >= 0) {
    explanation = id
      ? `Anda menyiapkan anggaran ${fmt(stated)}. Cakupan otomasi yang direkomendasikan membutuhkan sekitar ${fmt(initial)} di tahun pertama${basisNote}, jadi masih dalam anggaran. Anggaran adalah batas atas, bukan biaya proyek: semua angka keuangan di bawah dihitung dari investasi yang dibutuhkan. Muat dalam anggaran belum berarti cakupan ini balik modal; angka penghematan dan payback di bawah yang menunjukkannya.`
      : `You set aside ${fmt(stated)}. The recommended automation scope needs an estimated ${fmt(initial)} in year 1${basisNote}, which fits within it. Your budget is a ceiling, not the cost of the project: every financial figure below is calculated on the required investment. Fitting the budget does not mean the scope pays back; the savings and payback figures below show that.`
  } else {
    explanation = id
      ? `Anda menyiapkan anggaran ${fmt(stated)}, sedangkan investasi yang dibutuhkan untuk cakupan otomasi yang direkomendasikan diperkirakan ${fmt(initial)} di tahun pertama${basisNote} — kurang ${fmt(-remaining!)}. Pertimbangkan menjalankan otomasi berdampak tertinggi lebih dulu. Semua angka keuangan di bawah dihitung dari investasi yang dibutuhkan.`
      : `You set aside ${fmt(stated)}, while the recommended automation scope needs an estimated ${fmt(initial)} in year 1${basisNote} — ${fmt(-remaining!)} short. Consider starting with the highest-impact automation first. Every financial figure below is calculated on the required investment.`
  }

  // For the PDF: the Aivory delivery option as one short paragraph (the page renders the full card).
  const card = buildPlanComparison(calc as never, fmt, locale)
  const planNote = card ? `${card.recommendation} ${card.whatItIs}` : undefined

  let footnote: string
  if (transformation) {
    footnote = id
      ? 'Asumsi: jam setup per otomasi menurut kerumitan (rendah 20, sedang 60, tinggi 160 jam), dihargai dengan biaya per jam yang sama dengan perhitungan penghematan. Software dihitung dengan harga masuk dari daftar harga publik, dan hanya produk yang harganya untuk satu tim yang masuk hitungan. Paket dan plan Aivory tidak termasuk dalam angka ini: Aivory ditampilkan sebagai salah satu cara mengerjakan otomasinya. Software yang sudah Anda miliki tidak perlu dibeli lagi.'
      : "Assumptions: setup hours per automation by complexity (low 20, medium 60, high 160), priced at the same hourly cost used for the savings. Software is counted at entry public list prices, and only products priced for a whole team are counted. The Aivory package and plan are not part of these figures: Aivory is shown as one way to deliver the automation. Software you already have does not need to be bought again."
  } else if (planInFigures) {
    footnote = id
      ? `Asumsi: harga paket dan plan sesuai harga publik Aivory; jam setup per otomasi menurut kerumitan (rendah 20, sedang 60, tinggi 160 jam), dihargai dengan biaya per jam yang sama dengan perhitungan penghematan.${r.planPriceIsFloor ? ' Plan Enterprise dihargai lewat tim sales — harga Business dipakai sebagai batas bawah.' : ''} Software pendukung di bagian rekomendasi software bersifat opsional (jika belum dimiliki) dan tidak termasuk.`
      : `Assumptions: package and plan at Aivory's published prices; setup hours per automation by complexity (low 20, medium 60, high 160), priced at the same hourly cost used for the savings.${r.planPriceIsFloor ? ' The Enterprise plan is sales-priced — the Business price is used as a floor.' : ''} Supporting software in the software recommendations is optional (if you don't already have it) and not included.`
  } else {
    footnote = id
      ? 'Asumsi: harga paket sesuai harga publik Aivory; jam setup per otomasi menurut kerumitan (rendah 20, sedang 60, tinggi 160 jam), dihargai dengan biaya per jam yang sama dengan perhitungan penghematan. Langganan plan Aivory tidak termasuk dalam angka ini: lihat rekomendasi plan Aivory. Software pendukung di bagian rekomendasi software bersifat opsional (jika belum dimiliki) dan tidak termasuk.'
      : "Assumptions: the package at Aivory's published price; setup hours per automation by complexity (low 20, medium 60, high 160), priced at the same hourly cost used for the savings. The Aivory plan subscription is not part of these figures: see the Aivory plan recommendation. Supporting software in the software recommendations is optional (if you don't already have it) and not included."
  }

  return { explanation, rows, unpricedNote: transformation ? unpricedNoteFor(r, id) : undefined, planNote, footnote }
}
