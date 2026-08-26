/**
 * Single source of truth for the Executive Operational Diagnosis narrative
 * shared by the PDF export (lib/pdfExport.ts) and the on-screen final-result
 * page. Both surfaces MUST render these exact strings — the sentences are
 * built here, not copy-pasted, because independent copies are how the report
 * once showed 32.5%, 33% and 38% for the same underlying gap.
 *
 * Every exported builder below takes an explicit `locale` parameter — this
 * module has no React context, so locale is threaded as data, not read
 * implicitly. English and Indonesian sentences are written as independent
 * branches (never a translated interpolation into the other language's
 * grammar), per the English-specific-grammar note on buildExecutiveSummary.
 */

export type Locale = 'en' | 'id'

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * E1.7 — Confidence surfacing. Shared "evidence strength" label for the
 * Financial Case tiles, identical on the result page and the PDF. Returns
 * null for 'high' confidence (full data) so the indicator only appears where
 * a figure is actually resting on incomplete inputs — no badge clutter when
 * there's nothing to caveat.
 */
export function confidenceTileLabel(
  level: 'low' | 'medium' | 'high' | null | undefined,
  locale: Locale = 'en',
): string | null {
  if (!level || level === 'high') return null
  if (locale === 'id') return level === 'low' ? 'Keyakinan rendah' : 'Keyakinan sedang'
  return `${cap(level)} confidence`
}

/** Client-facing labels for the six scoring dimensions. */
export const DIM_LABELS: Record<Locale, Record<string, string>> = {
  en: {
    strategy: 'Strategy', data: 'Data', process: 'Process',
    people: 'People', governance: 'Governance', security: 'Security',
  },
  id: {
    strategy: 'Strategi', data: 'Data', process: 'Proses',
    people: 'SDM', governance: 'Tata Kelola', security: 'Keamanan',
  },
}

/**
 * Gap/percentage formatter — keeps fractional values exact (32.5%) instead of
 * letting each section round differently. Indonesian convention uses a comma
 * decimal separator.
 */
export function fmtGap(v: number, locale: Locale = 'en'): string {
  if (Number.isInteger(v)) return `${v}%`
  return locale === 'id' ? `${v.toFixed(1).replace('.', ',')}%` : `${v.toFixed(1)}%`
}

/** Client-facing labels for the internal answer keys used as risk sources. */
export const RISK_SOURCE_LABELS: Record<Locale, Record<string, string>> = {
  en: {
    compliance_requirements: 'Compliance requirements',
    data_quality: 'Data quality',
    leadership_alignment: 'Leadership alignment',
    change_readiness: 'Change readiness',
    budget_allocated: 'Budget allocation',
    process_documentation: 'Process documentation',
    budget_range: 'Budget range',
    fte_count: 'Team size',
    annual_revenue: 'Annual revenue',
    automation_current: 'Current automation level',
  },
  id: {
    compliance_requirements: 'Persyaratan Compliance',
    data_quality: 'Kualitas data',
    leadership_alignment: 'Keselarasan Executive',
    change_readiness: 'Kesiapan menghadapi perubahan',
    budget_allocated: 'Alokasi anggaran',
    process_documentation: 'Dokumentasi proses',
    budget_range: 'Kisaran anggaran',
    fte_count: 'Ukuran tim',
    annual_revenue: 'Pendapatan tahunan',
    automation_current: 'Tingkat otomasi saat ini',
  },
}

export function humanizeRiskSource(src: string, locale: Locale = 'en'): string {
  return RISK_SOURCE_LABELS[locale][src] ?? cap(src.replace(/_/g, ' '))
}

/**
 * Phase E1.2 — client-facing factor names for the raw answer keys used as
 * score drivers (see ScoreDriverItem.answerKey / computeScoreDrivers in
 * services/deepDiagnostic.ts). Same pattern as RISK_SOURCE_LABELS above.
 */
export const DRIVER_ANSWER_LABELS: Record<Locale, Record<string, string>> = {
  en: {
    quantified_goal: 'Quantified objective',
    kpi_tracking: 'KPI tracking',
    success_timeline: 'Success timeline',
    data_centralization: 'Data centralisation',
    data_quality: 'Data quality',
    system_integration: 'System integration',
    data_infrastructure: 'Data infrastructure',
    process_documentation: 'Process documentation',
    workflow_standardization: 'Workflow standardisation',
    automation_current: 'Current automation level',
    internal_capability: 'Internal AI capability',
    change_readiness: 'Change readiness',
    decision_speed: 'Decision speed',
    leadership_alignment: 'Leadership alignment',
    risk_tolerance: 'Risk tolerance',
    budget_allocated: 'Budget allocation',
    ai_governance: 'AI governance',
    ai_data_privacy: 'AI data privacy',
    compliance_requirements: 'Compliance requirements',
    data_residency: 'Data residency',
  },
  id: {
    quantified_goal: 'Tujuan terukur',
    kpi_tracking: 'Pelacakan KPI',
    success_timeline: 'Jangka waktu keberhasilan',
    data_centralization: 'Pemusatan data',
    data_quality: 'Kualitas data',
    system_integration: 'Integrasi sistem',
    data_infrastructure: 'Infrastruktur data',
    process_documentation: 'Dokumentasi proses',
    workflow_standardization: 'Standardisasi alur kerja',
    automation_current: 'Tingkat otomasi saat ini',
    internal_capability: 'Kapabilitas AI internal',
    change_readiness: 'Kesiapan menghadapi perubahan',
    decision_speed: 'Kecepatan pengambilan keputusan',
    leadership_alignment: 'Keselarasan Executive',
    risk_tolerance: 'Toleransi risiko',
    budget_allocated: 'Alokasi anggaran',
    ai_governance: 'Tata kelola AI',
    ai_data_privacy: 'Privasi data AI',
    compliance_requirements: 'Persyaratan Compliance',
    data_residency: 'Residensi data',
  },
}

export function humanizeDriverAnswerKey(key: string, locale: Locale = 'en'): string {
  return DRIVER_ANSWER_LABELS[locale][key] ?? cap(key.replace(/_/g, ' '))
}

/** Display label for a canonical maturity-level id (Nascent/Initiating/…). */
const MATURITY_LEVEL_LABELS: Record<Locale, Record<string, string>> = {
  en: { Nascent: 'Nascent', Initiating: 'Initiating', Developing: 'Developing', Defined: 'Defined', Optimising: 'Optimising' },
  id: { Nascent: 'Baru Mulai', Initiating: 'Memulai', Developing: 'Berkembang', Defined: 'Terdefinisi', Optimising: 'Optimal' },
}

/**
 * Public accessor for `MATURITY_LEVEL_LABELS` — `level` is the canonical
 * (never-translated) id stored on `scores.maturityLevel`; this resolves it
 * to a display label for the given locale. Handles the pre-2026-08-02
 * "Optimizing" spelling the same way `buildVerdictNarrative` does.
 */
export function maturityLevelLabel(level: string, locale: Locale = 'en'): string {
  const canonical = canonicalMaturityLevel(level)
  return MATURITY_LEVEL_LABELS[locale][canonical] ?? canonical
}

/**
 * Five-band operational maturity scale — thresholds mirror services
 * maturityFromScore. `level` is the CANONICAL English id stored on
 * `scores.maturityLevel` and used for matching (`MATURITY_BANDS.find(b =>
 * b.level === level)`) — it must never be translated. Use
 * `MATURITY_LEVEL_LABELS[locale][level]` for the display name.
 */
export const MATURITY_BANDS: Record<Locale, Array<{ level: string; range: string; meaning: string }>> = {
  en: [
    { level: 'Nascent', range: '0–34', meaning: 'the foundational building blocks — reliable data, documented processes, and clear ownership — are not yet in place, so operational groundwork should come before any automation investment' },
    { level: 'Initiating', range: '35–49', meaning: 'the organisation can support closely supervised pilots in narrow, low-risk workflows while the underlying data and process foundations are built up' },
    { level: 'Developing', range: '50–64', meaning: 'the organisation can standardise and instrument its core workflows while piloting automation in narrow, low-risk areas — but is not yet ready for a broad, multi-department rollout' },
    { level: 'Defined', range: '65–79', meaning: 'the organisation is ready for systematic operational transformation across several functions, with governance mature enough to manage risk at scale' },
    { level: 'Optimising', range: '80–100', meaning: 'well-instrumented operational foundations are in place across the organisation, and the focus shifts from standardisation to compounding advantage' },
  ],
  id: [
    { level: 'Nascent', range: '0–34', meaning: 'landasan fundamental — data yang andal, proses yang terdokumentasi, dan kepemilikan yang jelas — belum tersedia, sehingga fondasi operasional perlu dibangun lebih dulu sebelum investasi otomasi apa pun' },
    { level: 'Initiating', range: '35–49', meaning: 'organisasi dapat mendukung uji coba yang diawasi ketat pada alur kerja yang sempit dan berisiko rendah, sembari fondasi data dan proses yang mendasarinya terus dibangun' },
    { level: 'Developing', range: '50–64', meaning: 'organisasi dapat menstandardisasi dan menginstrumentasi alur kerja intinya sambil menguji coba otomasi pada area yang sempit dan berisiko rendah — namun belum siap untuk peluncuran luas di banyak departemen' },
    { level: 'Defined', range: '65–79', meaning: 'organisasi siap untuk transformasi operasional sistematis di beberapa fungsi, dengan tata kelola yang cukup matang untuk mengelola risiko dalam skala besar' },
    { level: 'Optimising', range: '80–100', meaning: 'fondasi operasional yang terinstrumentasi dengan baik sudah tersedia di seluruh organisasi, dan fokus bergeser dari standardisasi menuju keunggulan yang terus berlipat' },
  ],
}

/**
 * Resolves a stored maturity level to its current spelling.
 *
 * The top band was spelled "Optimizing" until 2026-08-02. Reports generated
 * before then still carry that value, and both band lookups below fall back to
 * Developing when they miss — which would silently show a 90/100 report the
 * wrong range and the wrong meaning. Normalising here keeps historical reports
 * accurate instead.
 */
function canonicalMaturityLevel(level: string): string {
  return level === 'Optimizing' ? 'Optimising' : level
}

/** What a low score in each dimension concretely blocks. */
export const DIM_CONSTRAINT_NOTES: Record<Locale, Record<string, string>> = {
  en: {
    strategy: 'without quantified KPIs, improvement value stays invisible and investment decisions stall',
    data: 'inconsistent operational decisions and capped automation potential persist until core data is centralised and cleaned',
    process: 'automations stay fragile until core workflows are documented and standardised',
    people: 'adoption stalls without skills enablement and clear internal ownership',
    governance: 'scaling automation without oversight structures compounds operational risk',
    security: 'security and compliance guardrails need defining before sensitive data reaches AI systems',
  },
  id: {
    strategy: 'tanpa KPI yang terukur, value peningkatan tetap tidak terlihat dan keputusan investasi tertahan',
    data: 'keputusan operasional yang tidak konsisten dan potensi otomasi yang terbatas akan terus terjadi hingga data inti dipusatkan dan dibersihkan',
    process: 'otomasi tetap rapuh selama alur kerja inti belum terdokumentasi dan terstandardisasi',
    people: 'adopsi terhambat tanpa peningkatan keterampilan dan kepemilikan internal yang jelas',
    governance: 'menskalakan otomasi tanpa struktur pengawasan akan melipatgandakan risiko operasional',
    security: 'aturan keamanan dan compliance perlu didefinisikan sebelum data sensitif masuk ke sistem AI',
  },
}

/** What a HIGH score in each dimension concretely means, in plain terms — the positive counterpart to DIM_CONSTRAINT_NOTES, used to translate the strongest dimension into something a non-finance reader immediately recognises. */
export const DIM_STRENGTH_NOTES: Record<Locale, Record<string, string>> = {
  en: {
    strategy: 'your business goals are clearly defined and tracked with real metrics',
    data: 'your operational data is clean and centralised, not scattered across tools',
    process: 'the way your team works is documented and consistent, not tribal knowledge',
    people: 'your team already has the skills and buy-in to adopt new tools',
    governance: 'you already have clear rules for how AI gets used in the business',
    security: 'your data-security rules are already well defined',
  },
  id: {
    strategy: 'tujuan bisnis Anda sudah jelas dan terukur dengan metrik yang nyata',
    data: 'data operasional Anda sudah rapi dan terpusat, tidak berserakan di berbagai tool',
    process: 'cara kerja tim Anda sudah rapi dan terdokumentasi, bukan cuma pengetahuan segelintir orang',
    people: 'tim Anda sudah punya keterampilan dan kesiapan untuk mengadopsi alat baru',
    governance: 'perusahaan Anda sudah punya aturan main yang jelas soal penggunaan AI',
    security: 'aturan keamanan data Anda sudah terdefinisi dengan baik',
  },
}

/**
 * Translates the strongest/weakest dimension pair into one plain-language
 * sentence a non-finance, non-technical reader can immediately parse —
 * e.g. "cara kerja tim Anda sudah rapi (skor Proses 93/100), tapi Anda
 * belum punya aturan jelas soal keamanan data (skor Keamanan 30/100)".
 * Sits above the 6-dimension breakdown so the reader gets the "so what"
 * before the numbers, not only after.
 */
export function buildOperationalHealthPlainLanguage(
  v: { strongestKey: string; strongestScore: number; strongestLabel: string; weakestKey: string; weakestScore: number; weakestLabel: string },
  locale: Locale = 'en',
): string {
  const strongPhrase = DIM_STRENGTH_NOTES[locale][v.strongestKey] ?? DIM_STRENGTH_NOTES[locale].process
  const weakPhrase = DIM_CONSTRAINT_NOTES[locale][v.weakestKey] ?? DIM_CONSTRAINT_NOTES[locale].security
  if (locale === 'id') {
    return `Artinya: ${strongPhrase} (skor ${v.strongestLabel} ${Math.round(v.strongestScore)}/100), tapi ${weakPhrase} (skor ${v.weakestLabel} ${Math.round(v.weakestScore)}/100).`
  }
  return `In plain terms: ${strongPhrase} (${v.strongestLabel} score ${Math.round(v.strongestScore)}/100), but ${weakPhrase} (${v.weakestLabel} score ${Math.round(v.weakestScore)}/100).`
}

/**
 * Report-wide glossary — defines the handful of English/finance terms the
 * report keeps in their original form (Quick Win, Transformation Blueprint,
 * Hand-off, NPV, ROI, FTE, Payback Period) once, up front, so they can be
 * used afterwards without re-explaining each time. Rendered as a small box
 * on the Executive Summary section (web + PDF).
 */
export const GLOSSARY_TERMS: Record<Locale, Array<{ term: string; definition: string }>> = {
  en: [
    { term: 'ROI (Return on Investment)', definition: 'The percentage return you get back relative to what you invested.' },
    { term: 'NPV (Net Present Value)', definition: "Future returns valued in today's money — can be negative even when ROI is positive (see Financial Case)." },
    { term: 'Payback Period', definition: 'How long it takes for the investment to pay for itself.' },
    { term: 'Quick Win', definition: 'A fast, low-effort step with results that show up quickly.' },
    { term: 'Transformation Blueprint', definition: 'The technical plan for deploying AI in your business — data sources, agent structure, workflow sequencing.' },
    { term: 'Hand-off', definition: 'The point where a task passes from an AI agent to a human, or back.' },
    { term: 'FTE (Full-Time Equivalent)', definition: 'Headcount measured in full-time positions.' },
  ],
  id: [
    { term: 'ROI (Return on Investment)', definition: 'Persentase keuntungan yang kembali dibandingkan biaya yang dikeluarkan.' },
    { term: 'NPV (Net Present Value)', definition: 'Nilai keuntungan masa depan setelah dihitung ke nilai uang saat ini — bisa negatif meski ROI positif (lihat Analisis Keuangan).' },
    { term: 'Payback Period (waktu balik modal)', definition: 'Waktu yang dibutuhkan investasi untuk kembali modal.' },
    { term: 'Quick Win', definition: 'Langkah cepat dengan usaha rendah yang hasilnya cepat terlihat.' },
    { term: 'Transformation Blueprint', definition: 'Rencana teknis penerapan AI di bisnis Anda — sumber data, struktur agen, urutan alur kerja.' },
    { term: 'Hand-off', definition: 'Titik di mana suatu pekerjaan dialihkan dari agen AI ke manusia, atau sebaliknya.' },
    { term: 'FTE (Full-Time Equivalent)', definition: 'Jumlah karyawan dihitung setara posisi penuh waktu.' },
  ],
}

/** One plain-language sentence framing the ROI/NPV math before the formulas — "explain it like I'm not an accountant" per the Metodologi section. */
export function buildMethodologyIntro(locale: Locale = 'en'): string {
  if (locale === 'id') {
    return 'Sederhananya: kami hitung berapa jam kerja manual yang bisa dihemat berkat otomasi, lalu kalikan dengan estimasi nilai gaji per jam untuk dapat value tenaga kerja. Setelah itu ditambah estimasi efisiensi proses, dibandingkan dengan investasi, dan hasilnya adalah waktu balik modal (payback period) serta ROI.'
  }
  return "In plain terms: we work out how many manual hours automation can free up, then multiply that by an hourly wage benchmark to get the labor value. We add an estimated process-efficiency gain, compare the total against your investment, and that gives the payback period and ROI below."
}

/**
 * Explains why the gross "ROI N Tahun" tile (before ongoing cost) and the
 * "Kisaran ROI N Tahun" range (net, after ongoing cost) show different numbers on
 * the same page, and why NPV can read negative while ROI reads positive —
 * the two points flagged as most confusing without this note.
 */
export function buildFinancialTermsNote(locale: Locale = 'en', horizonYears: number = 3): string {
  if (locale === 'id') {
    return `ROI ${horizonYears} Tahun di atas dihitung SEBELUM biaya operasional berjalan (lisensi, pemeliharaan, dukungan); Kisaran ROI ${horizonYears} Tahun di bawah dihitung SETELAH biaya itu dikurangi — jadi keduanya wajar berbeda. NPV juga bisa tampak negatif meski ROI positif: NPV menghitung nilai waktu uang dan menjumlahkan untung-rugi dari tahun ke tahun, jadi di periode sebelum modal kembali (payback), angkanya normal masih minus.`
  }
  return `The ${horizonYears}-Year ROI above is calculated BEFORE ongoing running costs (licenses, maintenance, support); the ${horizonYears}-Year ROI range below is calculated AFTER those costs are deducted — so the two numbers are expected to differ. NPV can also look negative even when ROI is positive: NPV accounts for the time value of money and nets cumulative gains against the investment, so it is normal for it to still read negative before the payback point is reached.`
}

/**
 * Per-dimension consequence chain, weakest dimension only (keep it focused).
 * Rendered as a compact "A → B → C → D" line on both surfaces via
 * `formatConsequenceChain`.
 */
export const DIM_CONSEQUENCE_CHAINS: Record<Locale, Record<string, string[]>> = {
  en: {
    data: ['Low data maturity', 'Inconsistent operational decisions', 'Lower automation potential', 'Higher operating costs'],
    process: ['Undocumented core processes', 'Fragile, person-dependent operations', 'Automation breaks on exceptions', 'Slower, riskier scaling'],
    strategy: ['No quantified operational KPIs', 'Improvement value is invisible', 'Investment decisions stall', 'Efficiency gains go unfunded'],
    people: ['Missing skills and ownership', 'Change adoption stalls', 'Tools go unused', 'Manual work persists'],
    governance: ['No oversight structures', 'Inconsistent execution quality', 'Compounding operational risk', 'Scaling multiplies errors'],
    security: ['Undefined data guardrails', 'Sensitive data exposure risk', 'Compliance blockers surface late', 'Transformation initiatives stall'],
  },
  id: {
    data: ['Kematangan data rendah', 'Keputusan operasional tidak konsisten', 'Potensi otomasi lebih rendah', 'Biaya operasional lebih tinggi'],
    process: ['Proses inti tidak terdokumentasi', 'Operasional rapuh dan bergantung pada individu', 'Otomasi gagal saat ada pengecualian', 'Penskalaan lebih lambat dan berisiko'],
    strategy: ['Tidak ada KPI operasional terukur', 'Value peningkatan tidak terlihat', 'Keputusan investasi tertahan', 'Peluang efisiensi tidak terdanai'],
    people: ['Keterampilan dan kepemilikan tidak jelas', 'Adopsi perubahan terhambat', 'Alat tidak digunakan', 'Pekerjaan manual terus berlanjut'],
    governance: ['Tidak ada struktur pengawasan', 'Kualitas eksekusi tidak konsisten', 'Risiko operasional berlipat ganda', 'Penskalaan melipatgandakan kesalahan'],
    security: ['Aturan keamanan data tidak terdefinisi', 'Risiko eksposur data sensitif', 'Penghambat compliance muncul terlambat', 'Inisiatif transformasi tertahan'],
  },
}

/** Joins a consequence chain into one narrative line: "A → B → C → D". */
export function formatConsequenceChain(chain: string[]): string {
  return chain.join(' → ')
}

/**
 * Flowing-prose alternative to the "A → B → C → D" chip chain, for the
 * weakest dimension's consequence chain — an arrow chain of noun phrases
 * reads as machine-translated in Indonesian even though the same device
 * works fine as an English business-writing convention. English callers
 * should keep using formatConsequenceChain/DIM_CONSEQUENCE_CHAINS directly;
 * this only covers 'id'. Same 4 conceptual beats as DIM_CONSEQUENCE_CHAINS,
 * connected into one narrative sentence pair ("Karena X, ada risiko Y.
 * Kalau ini dibiarkan, Z — dan pada akhirnya W.") instead of noun-phrase
 * fragments joined by arrows.
 */
const DIM_CONSEQUENCE_NARRATIVE_ID: Record<string, string> = {
  data: 'Karena kematangan data masih rendah, keputusan operasional jadi tidak konsisten. Kalau ini dibiarkan, potensi otomasi ikut terbatas — dan pada akhirnya biaya operasional jadi lebih tinggi dari seharusnya.',
  process: 'Karena proses inti belum terdokumentasi, operasional jadi rapuh dan bergantung pada orang tertentu. Kalau ini dibiarkan, otomasi akan gagal begitu ada pengecualian — dan penskalaan jadi lebih lambat serta berisiko.',
  strategy: 'Karena belum ada KPI operasional yang terukur, value dari setiap peningkatan jadi tidak terlihat. Kalau ini dibiarkan, keputusan investasi akan terus tertahan — dan peluang efisiensi yang ada jadi tidak terdanai.',
  people: 'Karena keterampilan dan kepemilikan tim belum jelas, adopsi perubahan jadi terhambat. Kalau ini dibiarkan, alat yang sudah disiapkan akan tetap tidak terpakai — dan pekerjaan manual terus berlanjut seperti biasa.',
  governance: 'Karena belum ada struktur pengawasan, kualitas eksekusi jadi tidak konsisten. Kalau ini dibiarkan, risiko operasional akan berlipat ganda — dan setiap upaya penskalaan justru melipatgandakan kesalahan.',
  security: 'Karena aturan keamanan data belum jelas, ada risiko data sensitif bocor atau disalahgunakan. Kalau ini dibiarkan, masalah compliance biasanya baru ketahuan belakangan — saat itu sudah terlambat dan menghambat proyek transformasi yang sedang berjalan.',
}

/** Returns the flowing-prose consequence narrative for 'id', or null for 'en' (caller keeps using the chip-chain UI in that case). */
export function buildConsequenceNarrative(key: string, locale: Locale = 'en'): string | null {
  if (locale !== 'id') return null
  return DIM_CONSEQUENCE_NARRATIVE_ID[key] ?? null
}

/** Mandate sentence derived from the leadership-alignment answer. */
export function buildLeadershipClause(leadershipRaw: string, locale: Locale = 'en'): string {
  if (locale === 'id') {
    return leadershipRaw.includes('Fully aligned')
      ? 'Executive yang sepenuhnya selaras memberikan mandat yang kuat untuk penerapan skala penuh.'
      : leadershipRaw.includes('Supportive')
        ? 'Executive mendukung namun tetap berhati-hati, sehingga inisiatif awal sebaiknya berisiko rendah dan cepat terukur untuk membangun kepercayaan.'
        : leadershipRaw.includes('Some interest')
          ? 'Ketertarikan Executive masih dalam tahap terbentuk, sehingga kemenangan awal perlu menunjukkan value bisnis secara jelas.'
          : 'Mengamankan sponsor Executive secara eksplisit sebaiknya menyertai inisiatif pertama.'
  }
  return leadershipRaw.includes('Fully aligned')
    ? 'Fully aligned leadership provides a strong mandate for scaled deployment.'
    : leadershipRaw.includes('Supportive')
      ? 'Leadership is supportive but cautious, so early initiatives should be low-risk and quickly measurable to build confidence.'
      : leadershipRaw.includes('Some interest')
        ? 'Leadership interest is still forming, so early wins need to make the business case visible.'
        : 'Securing explicit leadership sponsorship should accompany the first initiatives.'
}

export interface VerdictInputs {
  company: string
  composite: number
  maturityLevel: string
  weakestKey: string
  weakestScore: number
  strongestKey: string
  strongestScore: number
}

/** The band sentence: score, band range, practical meaning, constraint, foundation. */
export function buildVerdictNarrative(v: VerdictInputs, locale: Locale = 'en'): string {
  const level = canonicalMaturityLevel(v.maturityLevel)
  const bands = MATURITY_BANDS[locale]
  const band = bands.find((b) => b.level === level) ?? bands[2]
  const levelLabel = MATURITY_LEVEL_LABELS[locale][level] ?? level
  const weakestNote = DIM_CONSTRAINT_NOTES[locale][v.weakestKey]
    ?? (locale === 'id' ? 'dimensi ini perlu diperkuat sebelum otomasi dapat diskalakan' : 'this dimension needs strengthening before automation can scale')
  const weakLabel = DIM_LABELS[locale][v.weakestKey] ?? cap(v.weakestKey)
  const strongLabel = DIM_LABELS[locale][v.strongestKey] ?? cap(v.strongestKey)

  if (locale === 'id') {
    return `Dengan skor komposit ${Math.round(v.composite)}/100, ${v.company} berada pada level "${levelLabel}" (${band.range}) dari skala kematangan operasional Aivory yang terdiri dari lima level (Baru Mulai, Memulai, Berkembang, Terdefinisi, Optimal). Secara praktis, ${band.meaning}. Kendala langsung yang dihadapi adalah ${weakLabel} (${v.weakestScore}): ${weakestNote}. ${strongLabel} (${v.strongestScore}) adalah fondasi terkuat untuk dikembangkan.`
  }
  return `With a composite score of ${Math.round(v.composite)}/100, ${v.company} sits in the "${levelLabel}" band (${band.range}) of the five-level Aivory operational maturity scale (Nascent, Initiating, Developing, Defined, Optimising). In practical terms, ${band.meaning}. The immediate constraint is ${weakLabel} (${v.weakestScore}): ${weakestNote}. ${strongLabel} (${v.strongestScore}) is the strongest foundation to build on.`
}

export interface FirstMove {
  title: string
  body: string
}

export interface FirstMovesInputs {
  firstImprovement: { title: string; recommendedAction: string } | null
  topOpportunity: { title: string; timeToValueWeeks: number; dataReadiness: string } | null
  hasBudgetInput: boolean
  leadershipClause: string
}

/**
 * The first-moves rows, ordered foundation → proof → mandate/budget.
 * `m.firstImprovement.title`/`.recommendedAction`, `m.topOpportunity.title`,
 * and `m.leadershipClause` are pre-resolved by the caller for the current
 * locale (they originate in services/deepDiagnostic.ts and
 * buildLeadershipClause above) — this function only composes the
 * surrounding sentence, it never translates content passed into it.
 */
export function buildFirstMoves(m: FirstMovesInputs, locale: Locale = 'en'): FirstMove[] {
  const moves: FirstMove[] = []
  if (locale === 'id') {
    if (m.firstImprovement) {
      moves.push({
        title: `Perbaiki fondasi: ${m.firstImprovement.title}`,
        body: m.firstImprovement.recommendedAction,
      })
    }
    if (m.topOpportunity) {
      moves.push({
        title: `Buktikan value dengan cepat: ${m.topOpportunity.title}`,
        body: `Peluang awal dengan dampak tertinggi — waktu ke value ${m.topOpportunity.timeToValueWeeks} minggu${m.topOpportunity.dataReadiness === 'ready' ? ', data sudah siap hari ini' : ''}.`,
      })
    }
    if (!m.hasBudgetInput) {
      moves.push({
        title: 'Tentukan besaran anggaran',
        body: 'Tidak ada anggaran implementasi yang diberikan dalam asesmen. Memberikan kisaran anggaran akan melengkapi model payback dan ROI, serta mengubah estimasi ini menjadi kasus bisnis yang siap untuk keputusan.',
      })
    } else {
      moves.push({ title: 'Dapatkan dukungan Executive', body: m.leadershipClause })
    }
    return moves
  }

  if (m.firstImprovement) {
    moves.push({
      title: `Fix the foundation: ${m.firstImprovement.title}`,
      body: m.firstImprovement.recommendedAction,
    })
  }
  if (m.topOpportunity) {
    moves.push({
      title: `Prove value fast: ${m.topOpportunity.title}`,
      body: `Highest-impact starting opportunity — ${m.topOpportunity.timeToValueWeeks}-week time to value${m.topOpportunity.dataReadiness === 'ready' ? ', data ready today' : ''}.`,
    })
  }
  if (!m.hasBudgetInput) {
    moves.push({
      title: 'Size the budget',
      body: 'No implementation budget was provided in the assessment. Supplying a budget range completes the payback and ROI model and turns these estimates into a decision-ready business case.',
    })
  } else {
    moves.push({ title: 'Secure the mandate', body: m.leadershipClause })
  }
  return moves
}

/**
 * Short, plain-business characterisation of each band — deliberately WORDED
 * DIFFERENTLY from `MATURITY_BANDS[locale][].meaning` (which frames the band
 * in terms of pilot/rollout readiness and is used by the Executive
 * Operational Diagnosis). The Executive Summary opens the report and must
 * not read as a verbatim preview of the section that follows it.
 */
const MATURITY_BAND_POSTURE: Record<Locale, Record<string, string>> = {
  en: {
    Nascent: 'the basics — clean data, written-down processes, clear owners — are not yet in place',
    Initiating: 'results still depend more on individual effort than on repeatable systems',
    Developing: 'core workflows exist but are applied unevenly across the business',
    Defined: 'processes are documented and followed consistently enough to scale on',
    Optimising: 'operations are measured and instrumented, and improvement compounds',
  },
  id: {
    Nascent: 'hal-hal dasar — data yang bersih, proses yang tertulis, kepemilikan yang jelas — belum tersedia',
    Initiating: 'hasil masih lebih bergantung pada usaha individu daripada sistem yang berulang',
    Developing: 'alur kerja inti sudah ada namun diterapkan secara tidak merata di seluruh bisnis',
    Defined: 'proses terdokumentasi dan dijalankan cukup konsisten untuk dapat diskalakan',
    Optimising: 'operasional terukur dan terinstrumentasi, dan peningkatan terus berlipat',
  },
}

/**
 * Opening section of the report.
 *
 * This used to be literally `buildVerdictNarrative(v)`'s first sentence, which
 * meant the Executive Summary and the Executive Operational Diagnosis opened
 * with the SAME sentence word-for-word ("With a composite score of X/100, …
 * five-level Aivory operational maturity scale (Nascent, Initiating, …)") —
 * two pages apart. It now leads on position → value at stake → the one
 * constraint, and hands off to the diagnosis rather than pre-empting it. The
 * band range and the five-level enumeration deliberately appear ONLY in the
 * diagnosis.
 *
 * The English branch computes an "a"/"an" article from the band name — this
 * has no Indonesian equivalent (no indefinite article), so the Indonesian
 * branch is its own independent sentence, not a templated substitution.
 */
export function buildExecutiveSummary(
  v: VerdictInputs & { businessValueLabel: string | null; topOpportunityTitle: string | null },
  locale: Locale = 'en',
): string {
  const level = canonicalMaturityLevel(v.maturityLevel)
  const posture = MATURITY_BAND_POSTURE[locale][level] ?? MATURITY_BAND_POSTURE[locale].Developing
  const levelLabel = MATURITY_LEVEL_LABELS[locale][level] ?? level
  const weakLabel = DIM_LABELS[locale][v.weakestKey] ?? cap(v.weakestKey)

  if (locale === 'id') {
    const opening = `${v.company} memperoleh skor ${Math.round(v.composite)} dari 100 berdasarkan metodologi penilaian Kematangan Operasional Aivory — posisi "${levelLabel}", di mana ${posture}.`

    let valueSentence = ''
    if (v.businessValueLabel && v.topOpportunityTitle) {
      valueSentence = ` Menindaklanjuti temuan dalam laporan ini diproyeksikan membuka value bisnis tahunan senilai ${v.businessValueLabel}, dengan ${v.topOpportunityTitle.toLowerCase()} sebagai langkah pertama tercepat.`
    } else if (v.businessValueLabel) {
      valueSentence = ` Menindaklanjuti temuan dalam laporan ini diproyeksikan membuka value bisnis tahunan senilai ${v.businessValueLabel}.`
    } else if (v.topOpportunityTitle) {
      valueSentence = ` Langkah pertama tercepat adalah ${v.topOpportunityTitle.toLowerCase()}.`
    }

    const constraint = ` Satu-satunya kendala yang menghambat adalah ${weakLabel} (${v.weakestScore}) — dibahas lebih lanjut dalam diagnosis berikut.`

    return `${opening}${valueSentence}${constraint}`
  }

  const article = /^[AEIOU]/i.test(level) ? 'an' : 'a'
  const opening = `${v.company} scores ${Math.round(v.composite)} out of 100 under Aivory's Operational Maturity Assessment methodology — ${article} "${levelLabel}" posture, where ${posture}.`

  let valueSentence = ''
  if (v.businessValueLabel && v.topOpportunityTitle) {
    valueSentence = ` Acting on the findings in this report is projected to unlock ${v.businessValueLabel} in annual business value, with ${v.topOpportunityTitle.toLowerCase()} the fastest first move.`
  } else if (v.businessValueLabel) {
    valueSentence = ` Acting on the findings in this report is projected to unlock ${v.businessValueLabel} in annual business value.`
  } else if (v.topOpportunityTitle) {
    valueSentence = ` The fastest first move is ${v.topOpportunityTitle.toLowerCase()}.`
  }

  const constraint = ` The single constraint standing in the way is ${weakLabel} (${v.weakestScore}) — examined in the diagnosis that follows.`

  return `${opening}${valueSentence}${constraint}`
}

/** Lowercase, consequence-first phrase describing what a weak dimension concretely is. */
const DIM_INSIGHT_LABEL: Record<Locale, Record<string, string>> = {
  en: {
    data: 'unreliable and fragmented operational data',
    process: 'inconsistent operational processes',
    strategy: 'the absence of quantified operational KPIs',
    people: 'gaps in skills and clear ownership',
    governance: 'the absence of oversight structures',
    security: 'undefined data security guardrails',
  },
  id: {
    data: 'data operasional yang tidak andal dan terfragmentasi',
    process: 'proses operasional yang tidak konsisten',
    strategy: 'tidak adanya KPI operasional yang terukur',
    people: 'kesenjangan keterampilan dan kepemilikan yang jelas',
    governance: 'tidak adanya struktur pengawasan',
    security: 'aturan keamanan data yang tidak terdefinisi',
  },
}

/** The one recommendation to fix a weak dimension, phrased as an imperative clause. */
const DIM_INSIGHT_ACTION: Record<Locale, Record<string, string>> = {
  en: {
    data: 'Centralizing and cleaning core data before scaling automation',
    process: 'Standardising workflows before automation',
    strategy: 'Defining quantified KPIs before funding new initiatives',
    people: 'Investing in skills enablement and clear ownership',
    governance: 'Establishing oversight structures before scaling automation',
    security: 'Defining data security guardrails before sensitive data reaches AI systems',
  },
  id: {
    data: 'Memusatkan dan membersihkan data inti sebelum menskalakan otomasi',
    process: 'Menstandardisasi alur kerja sebelum otomasi',
    strategy: 'Mendefinisikan KPI terukur sebelum mendanai inisiatif baru',
    people: 'Berinvestasi pada peningkatan keterampilan dan kepemilikan yang jelas',
    governance: 'Membangun struktur pengawasan sebelum menskalakan otomasi',
    security: 'Mendefinisikan aturan keamanan data sebelum data sensitif masuk ke sistem AI',
  },
}

export interface ExecutiveInsightInputs {
  /** diagnosis */
  weakestKey?: string
  /** financial */
  paybackMonths?: number | null
  threeYearROIPercent?: number | null
  /** Adaptive ROI window backing threeYearROIPercent (defaults to 3 for pre-2026-08-26 reports). */
  roiHorizonYears?: number | null
  hasBudgetInput?: boolean
  /** opportunities */
  topOpportunityTitle?: string | null
  topOpportunityTimeToValueWeeks?: number | null
  topOpportunityDataReadiness?: string | null
  /** improvements */
  topImprovementTitle?: string | null
  topImprovementAction?: string | null
}

/**
 * Deterministic, consequence-first Executive Insight for a section — string
 * templates only, never an LLM call. Bar for quality (CMO reference):
 * "Your greatest constraint is not AI capability. It is inconsistent
 * operational processes. Standardising workflows before automation will
 * reduce implementation risk, improve adoption, and accelerate ROI."
 */
export function buildExecutiveInsight(
  section: 'diagnosis' | 'opportunities' | 'financial' | 'improvements',
  inputs: ExecutiveInsightInputs,
  locale: Locale = 'en',
): string {
  if (locale === 'id') {
    switch (section) {
      case 'diagnosis': {
        const key = inputs.weakestKey ?? ''
        const label = DIM_INSIGHT_LABEL.id[key] ?? 'inkonsistensi operasional di seluruh organisasi'
        const action = DIM_INSIGHT_ACTION.id[key] ?? 'Memperkuat dimensi ini sebelum otomasi'
        return `Kendala terbesar Anda bukan kapabilitas AI. Kendalanya adalah ${label}. ${action} akan mengurangi risiko implementasi, meningkatkan adopsi, dan mempercepat ROI.`
      }
      case 'opportunities': {
        if (!inputs.topOpportunityTitle) {
          return 'Belum ada peluang otomasi yang berhasil diidentifikasi. Menjalankan ulang Diagnostik Mendalam akan menghasilkan sekumpulan peluang terprioritas dan terurut untuk disusun lebih dulu.'
        }
        const ttv = inputs.topOpportunityTimeToValueWeeks
        const readyClause = inputs.topOpportunityDataReadiness === 'ready' ? ', dengan data yang sudah siap hari ini' : ''
        return `Jalur tercepat untuk membuktikan value adalah ${inputs.topOpportunityTitle.toLowerCase()}${ttv ? `, dapat direalisasikan hanya dalam ${ttv} minggu` : ''}${readyClause}. Memulai eksekusi dari sini membangun momentum dan mengurangi risiko pada sisa peta jalan transformasi.`
      }
      case 'financial': {
        if (inputs.hasBudgetInput && inputs.paybackMonths != null && inputs.threeYearROIPercent != null) {
          return `Analisis keuangan ini sudah siap untuk keputusan: payback dalam ${Math.round(inputs.paybackMonths)} bulan dan ROI ${inputs.roiHorizonYears ?? 3} tahun sebesar ${Math.round(inputs.threeYearROIPercent)}%. Menyetujui anggaran sekarang mengubah analisis ini menjadi penghematan yang terus berlipat — setiap kuartal keterlambatan adalah kuartal biaya yang bisa dihindari.`
        }
        return 'Analisis keuangan ini belum dapat difinalisasi tanpa input anggaran. Memberikan kisaran anggaran minggu ini akan mengubah proyeksi ini menjadi kasus bisnis yang siap dibawa ke dewan, lengkap dengan periode payback dan ROI multi-tahun yang akurat.'
      }
      case 'improvements': {
        if (!inputs.topImprovementTitle) {
          return 'Belum ada prioritas peningkatan yang berhasil diidentifikasi. Menjalankan ulang Diagnostik Mendalam akan mengungkap kesenjangan operasional spesifik yang perlu ditutup lebih dulu.'
        }
        const actionClause = inputs.topImprovementAction ? ` ${inputs.topImprovementAction}` : ''
        return `Perbaikan dengan prioritas tertinggi adalah ${inputs.topImprovementTitle}.${actionClause} Menutup kesenjangan ini lebih dulu menghilangkan penghambat terbesar untuk otomasi yang andal dan melindungi analisis keuangan di atas.`
      }
    }
  }

  switch (section) {
    case 'diagnosis': {
      const key = inputs.weakestKey ?? ''
      const label = DIM_INSIGHT_LABEL.en[key] ?? 'operational inconsistency across the organisation'
      const action = DIM_INSIGHT_ACTION.en[key] ?? 'Strengthening this dimension before automation'
      return `Your greatest constraint is not AI capability. It is ${label}. ${action} will reduce implementation risk, improve adoption, and accelerate ROI.`
    }
    case 'opportunities': {
      if (!inputs.topOpportunityTitle) {
        return 'No automation opportunities have been derived yet. Re-running the Deep Diagnostic will generate a prioritised, ranked opportunity set to sequence first.'
      }
      const ttv = inputs.topOpportunityTimeToValueWeeks
      const readyClause = inputs.topOpportunityDataReadiness === 'ready' ? ', with data ready today' : ''
      return `The fastest path to proof is ${inputs.topOpportunityTitle.toLowerCase()}${ttv ? `, deliverable in as little as ${ttv} weeks` : ''}${readyClause}. Sequencing execution to start here builds momentum and de-risks the rest of the transformation roadmap.`
    }
    case 'financial': {
      if (inputs.hasBudgetInput && inputs.paybackMonths != null && inputs.threeYearROIPercent != null) {
        return `The financial case is decision-ready: payback in ${Math.round(inputs.paybackMonths)} months and a ${Math.round(inputs.threeYearROIPercent)}% ${inputs.roiHorizonYears ?? 3}-year ROI. Approving budget now converts this analysis into compounding savings — every quarter of delay is a quarter of avoidable cost.`
      }
      return 'The financial case cannot be finalized without a budget input. Supplying a budget range this week turns these projections into a board-ready business case with an accurate payback period and multi-year ROI.'
    }
    case 'improvements': {
      if (!inputs.topImprovementTitle) {
        return 'No improvement priorities have been identified yet. Re-running the Deep Diagnostic will surface the specific operational gaps to close first.'
      }
      const actionClause = inputs.topImprovementAction ? ` ${inputs.topImprovementAction}` : ''
      return `The highest-priority fix is ${inputs.topImprovementTitle}.${actionClause} Closing this gap first removes the single largest blocker to reliable automation and protects the financial case above.`
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Phase E2.6 — section-level "so what" density pass. Short (5-15 word),
// one-line captions for the report's charts/tables, distinct from the
// section-level Executive Insight above: the Executive Insight covers the
// whole section's recommendation, these state the specific takeaway visible
// in ONE visual, derived only from fields already on DiagnosticContext.
// Deterministic string templates only, no LLM. Shared here so any caption
// that appears on both the result page and the PDF (dimension bars, ROI
// tiles, risk register) can never independently drift — see file header.
// ─────────────────────────────────────────────────────────────────────────

type DimensionKey = 'strategy' | 'data' | 'process' | 'people' | 'governance' | 'security'
const DIM_ORDER: DimensionKey[] = ['strategy', 'data', 'process', 'people', 'governance', 'security']

/**
 * Radar chart caption (page-only — the PDF renders a static score arc, not
 * a radar). States how far the weakest dimension trails the average of the
 * other five, the thing a reader can't get from the axis labels alone.
 */
export function buildDimensionSpreadCaption(
  scores: Record<string, number>,
  locale: Locale = 'en',
): string {
  const vals = DIM_ORDER.map((k) => Math.round(scores[k] ?? 0))
  const weakestIdx = vals.indexOf(Math.min(...vals))
  const weakestKey = DIM_ORDER[weakestIdx]
  const others = vals.filter((_, i) => i !== weakestIdx)
  const avgOthers = others.reduce((a, b) => a + b, 0) / others.length
  const gap = Math.round(avgOthers - vals[weakestIdx])
  const label = DIM_LABELS[locale][weakestKey] ?? cap(weakestKey)
  if (locale === 'id') {
    if (gap <= 3) {
      return 'Keenam dimensi Anda cukup seimbang — tidak ada satu area pun yang menahan profil Anda secara signifikan.'
    }
    return `${label} adalah titik terlemah Anda — tertinggal ${gap} poin dari rata-rata lima dimensi lainnya.`
  }
  if (gap <= 3) {
    return 'Your six dimensions are evenly matched — no single area is dragging the profile down.'
  }
  return `${label} is your weakest link — it trails the average of your other five dimensions by ${gap} points.`
}

/**
 * Dimension bars caption — shared by the result page (DimensionBenchmarkBars)
 * and the PDF's dimension-bar block. Only meaningful once an industry
 * benchmark exists (the bars themselves show "vs median" ticks); returns
 * null so callers can omit the caption line entirely when there's no
 * benchmark to summarise, matching the bars' own graceful degradation.
 */
export function buildDimensionBenchmarkCaption(
  scores: Record<string, number>,
  benchmark: Partial<Record<DimensionKey, { median: number }>> | null | undefined,
  locale: Locale = 'en',
): string | null {
  if (!benchmark) return null
  let below = 0
  let worstGap = -Infinity
  let worstKey: DimensionKey | null = null
  for (const key of DIM_ORDER) {
    const point = benchmark[key]
    if (!point) continue
    const score = Math.round(scores[key] ?? 0)
    if (score < point.median) below += 1
    const gap = point.median - score
    if (gap > worstGap) {
      worstGap = gap
      worstKey = key
    }
  }
  if (worstKey === null) return null
  if (locale === 'id') {
    if (below === 0) return 'Anda berada pada atau di atas median industri di semua dimensi yang diukur.'
    const label = DIM_LABELS.id[worstKey] ?? cap(worstKey)
    return `Di bawah median industri pada ${below} dari 6 dimensi — ${label} tertinggal paling jauh, sebesar ${Math.round(worstGap)} poin.`
  }
  if (below === 0) return 'You are at or above the industry median in every dimension measured.'
  const label = DIM_LABELS.en[worstKey] ?? cap(worstKey)
  return `Below industry median in ${below} of 6 dimensions — ${label} trails furthest, by ${Math.round(worstGap)} points.`
}

/**
 * Opportunity matrix caption (page-only — the PDF lists opportunity cards
 * linearly rather than plotting the impact/effort scatter). States the
 * quadrant distribution, the thing the scatter shape communicates that the
 * per-card list below it does not.
 */
export function buildOpportunityMatrixCaption(
  opportunities: Array<{ quadrant: string }>,
  locale: Locale = 'en',
): string | null {
  if (!Array.isArray(opportunities) || opportunities.length === 0) return null
  const quickWins = opportunities.filter((o) => o.quadrant === 'quick_win').length
  if (locale === 'id') {
    if (quickWins === 0) {
      return 'Tidak ada quick win dalam kumpulan ini — setiap peluang di sini membutuhkan usaha signifikan sebelum membawa hasil.'
    }
    const pct = Math.round((quickWins / opportunities.length) * 100)
    return `${quickWins} dari ${opportunities.length} peluang (${pct}%) adalah quick win — dampak tinggi, usaha rendah.`
  }
  if (quickWins === 0) {
    return 'No quick wins in this set — every opportunity here requires meaningful effort before payoff.'
  }
  const pct = Math.round((quickWins / opportunities.length) * 100)
  return `${quickWins} of ${opportunities.length} opportunities (${pct}%) are quick wins — high impact, low effort.`
}

/**
 * ROI metric tile grid caption — shared by the result page (roiGrid) and
 * the PDF's 2x2 financial tile block. States the labor-vs-process split
 * behind "Business Value Created", a relationship no single tile shows on
 * its own. Percentage-only (no currency) so page and PDF never need to pass
 * a formatter through — avoids re-opening the *Local-vs-*IDR formatting
 * bug class documented in app/diagnostics/deep/final-result/page.tsx.
 */
export function buildRoiTilesCaption(
  annualLaborSavingsLocal: number | null | undefined,
  annualProcessSavingsLocal: number | null | undefined,
  locale: Locale = 'en',
): string | null {
  const labor = annualLaborSavingsLocal ?? 0
  const process = annualProcessSavingsLocal ?? 0
  const total = labor + process
  if (total <= 0) return null
  const laborPct = Math.round((labor / total) * 100)
  if (locale === 'id') {
    if (laborPct >= 55) {
      return `${laborPct}% dari value ini berasal dari tenaga kerja yang dipulihkan — keuntungan efisiensi proses bersifat sekunder.`
    }
    if (laborPct <= 45) {
      return `${100 - laborPct}% dari value ini berasal dari keuntungan efisiensi proses, bukan hanya tenaga kerja.`
    }
    return 'Value terbagi rata antara tenaga kerja yang dipulihkan dan keuntungan efisiensi proses.'
  }
  if (laborPct >= 55) {
    return `${laborPct}% of this value is recovered labor — process-efficiency gains are secondary.`
  }
  if (laborPct <= 45) {
    return `${100 - laborPct}% of this value comes from process-efficiency gains, not labor alone.`
  }
  return 'Value is split evenly between recovered labor and process-efficiency gains.'
}

/**
 * Operational Constraints (risk register) caption — shared by the result
 * page's RiskCard list and the PDF's renderRiskRegister. States whether
 * high-severity risks cluster around one signal, the pattern a reader would
 * otherwise have to scan every card to notice.
 */
export function buildRiskRegisterCaption(
  risks: Array<{ severity: 'HIGH' | 'MEDIUM' | 'LOW'; source: string }>,
  locale: Locale = 'en',
): string | null {
  if (!Array.isArray(risks) || risks.length === 0) return null
  const highRisks = risks.filter((r) => r.severity === 'HIGH')
  if (locale === 'id') {
    if (highRisks.length === 0) {
      return `Tidak ada risiko tingkat tinggi — ${risks.length} item yang ditandai merupakan item pemantauan dengan urgensi lebih rendah.`
    }
    const counts: Record<string, number> = {}
    for (const r of highRisks) counts[r.source] = (counts[r.source] ?? 0) + 1
    const [topSource, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    if (topCount > 1) {
      return `${highRisks.length} risiko tingkat tinggi, terkonsentrasi pada ${humanizeRiskSource(topSource, 'id').toLowerCase()}.`
    }
    return `${highRisks.length} risiko tingkat tinggi memerlukan perhatian sebelum menskalakan otomasi.`
  }
  if (highRisks.length === 0) {
    return `No high-severity risks — the ${risks.length} flagged item${risks.length === 1 ? '' : 's'} are lower-urgency watch items.`
  }
  const counts: Record<string, number> = {}
  for (const r of highRisks) counts[r.source] = (counts[r.source] ?? 0) + 1
  const [topSource, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  if (topCount > 1) {
    return `${highRisks.length} high-severity risks, concentrated in ${humanizeRiskSource(topSource, 'en').toLowerCase()}.`
  }
  return `${highRisks.length} high-severity risk${highRisks.length === 1 ? '' : 's'} ${highRisks.length === 1 ? 'requires' : 'require'} attention before scaling automation.`
}

/**
 * C5 — single-constraint fold line. When the Operational Constraints section
 * would carry FEWER THAN 2 risks it is not worth a standalone section (it
 * reads empty/templated), so the lone risk is folded into the Executive
 * Operational Diagnosis as one "Key constraint: …" line instead. Shared by
 * page and PDF so the folded sentence is identical on both surfaces. Returns
 * null unless there is exactly one risk (0 risks → nothing to fold; ≥2 → the
 * section stands on its own).
 */
export function buildFoldedConstraintNote(
  risks: Array<{ risk: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; source: string }>,
  locale: Locale = 'en',
): string | null {
  if (!Array.isArray(risks) || risks.length !== 1) return null
  const r = risks[0]
  // The "(sinyal/signal: X)" source-attribution clause used to render here,
  // e.g. "Insufficient leadership alignment... (sinyal: keselarasan
  // kepemimpinan)" — but r.risk almost always already names its own topic in
  // plain words, so the parenthetical just repeats what the sentence already
  // said. Reads as a leaked internal debug tag, not extra information for
  // the reader — dropped rather than translated.
  const body = r.risk.trim().replace(/\.*$/, '')
  if (locale === 'id') {
    return `Kendala utama: ${body}.`
  }
  return `Key constraint: ${body}.`
}

/**
 * AI Enablement — the closing paragraph on both surfaces. Positions AI as
 * the execution layer of the transformation (Business → Operations →
 * Processes → Data → Automation → AI), never the headline.
 */
export function buildAiEnablement(
  inputs: { topOpportunityTitle: string | null; weakestLabel: string },
  locale: Locale = 'en',
): string {
  if (locale === 'id') {
    const oppClause = inputs.topOpportunityTitle
      ? `dimulai dengan ${inputs.topOpportunityTitle.toLowerCase()}`
      : 'dimulai dengan peluang berprioritas tertinggi yang teridentifikasi dalam laporan ini'
    const weakestClause = inputs.weakestLabel ? inputs.weakestLabel.toLowerCase() : 'kendala-kendala yang teridentifikasi di atas'
    return `AI adalah lapisan eksekusi dari transformasi ini, bukan judul utamanya. Urutan yang menghasilkan hasil adalah Bisnis → Operasional → Proses → Data → Otomasi → AI: perjelas tujuan bisnis, perbaiki model operasi, standardisasi proses, benahi data, otomasikan yang sudah andal, dan baru setelah itu terapkan AI untuk mempercepatnya. Dengan ${weakestClause} sebagai kendala saat ini, menutup fondasi tersebut menjadi langkah pertama — dari sana, ${oppClause} adalah titik di mana eksekusi yang dipercepat AI memberikan pengembalian tercepat dan paling dapat dipertanggungjawabkan. Transformation Blueprint di bawah ini mengubah urutan ini menjadi rencana yang siap diterapkan.`
  }
  const oppClause = inputs.topOpportunityTitle
    ? `starting with ${inputs.topOpportunityTitle.toLowerCase()}`
    : 'starting with the highest-priority opportunity identified in this report'
  const weakestClause = inputs.weakestLabel ? inputs.weakestLabel.toLowerCase() : 'the constraints identified above'
  return `AI is the execution layer of this transformation, not its headline. The sequence that delivers results is Business → Operations → Processes → Data → Automation → AI: clarify the business objective, fix the operating model, standardise the process, get the data right, automate what is now reliable, and only then deploy AI to accelerate it. With ${weakestClause} as the current constraint, closing that foundation comes first — from there, ${oppClause} is where AI-accelerated execution delivers the fastest, most defensible return. The Transformation Blueprint below turns this sequence into a deployment-ready plan.`
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2 — Explainability Layer (DEEP-DIAGNOSTIC-EXPERIENCE-V2-PLANNING.md).
// These three builders add no new intelligence — they compose already-computed
// engine output (RankedOpportunity fields, ScoreDrivers, ROI missingInputs)
// into short, scannable reason lists. Shared by the result page and the PDF
// so both surfaces read identically, same discipline as everything above.
// ────────────────────────────────────────────────────────────────────────────

export interface WhyRecommendationInputs {
  quadrant: string
  complexity: 'low' | 'medium' | 'high'
  dataReadiness: 'ready' | 'needs_prep' | 'not_ready'
  timeToValueWeeks: number
  prerequisites: string[]
}

const COMPLEXITY_CLAUSE: Record<Locale, Record<WhyRecommendationInputs['complexity'], string>> = {
  en: {
    low: 'Low implementation effort',
    medium: 'Moderate implementation effort',
    high: 'High implementation effort',
  },
  id: {
    low: 'Usaha implementasi rendah',
    medium: 'Usaha implementasi sedang',
    high: 'Usaha implementasi tinggi',
  },
}

const DATA_READINESS_CLAUSE: Record<Locale, Record<WhyRecommendationInputs['dataReadiness'], string>> = {
  en: {
    ready: 'Data already available',
    needs_prep: 'Needs data preparation first',
    not_ready: 'Data not yet ready',
  },
  id: {
    ready: 'Data sudah tersedia',
    needs_prep: 'Perlu persiapan data lebih dulu',
    not_ready: 'Data belum siap',
  },
}

/**
 * Phase 2.1 — "Why This Recommendation". Every input here is already a field
 * on `RankedOpportunity` (services/deepDiagnostic.ts `rankOpportunities`) —
 * this only rephrases them as a short reason list, it computes nothing new.
 */
export function buildWhyThisRecommendation(o: WhyRecommendationInputs, locale: Locale = 'en'): string[] {
  const reasons: string[] = []
  if (locale === 'id') {
    if (o.quadrant === 'quick_win') reasons.push('Dampak tinggi, quick win')
    else if (o.quadrant === 'major_project') reasons.push('Dampak tinggi, inisiatif yang lebih besar')
    reasons.push(COMPLEXITY_CLAUSE.id[o.complexity] ?? COMPLEXITY_CLAUSE.id.medium)
    reasons.push(DATA_READINESS_CLAUSE.id[o.dataReadiness] ?? DATA_READINESS_CLAUSE.id.needs_prep)
    reasons.push(`Estimasi hasil dalam ${o.timeToValueWeeks} minggu`)
    if (o.prerequisites.length > 0) reasons.push(`Membutuhkan: ${o.prerequisites.join(', ')}`)
    return reasons
  }
  if (o.quadrant === 'quick_win') reasons.push('High impact, quick win')
  else if (o.quadrant === 'major_project') reasons.push('High impact, larger initiative')
  reasons.push(COMPLEXITY_CLAUSE.en[o.complexity] ?? COMPLEXITY_CLAUSE.en.medium)
  reasons.push(DATA_READINESS_CLAUSE.en[o.dataReadiness] ?? DATA_READINESS_CLAUSE.en.needs_prep)
  reasons.push(`Estimated results in ${o.timeToValueWeeks} weeks`)
  if (o.prerequisites.length > 0) reasons.push(`Requires: ${o.prerequisites.join(', ')}`)
  return reasons
}

const AREA_TO_DIMENSION: Record<string, string> = {
  Process: 'process', Data: 'data', Strategy: 'strategy',
  People: 'people', Governance: 'governance', Security: 'security',
}

/**
 * Phase 2.2 — "Evidence Used". Pulls the top 2 answers `computeScoreDrivers`
 * already resolved for the dimension a Room-for-Improvement item targets, or
 * — for the "Automation Coverage" item, which has no single scoring
 * dimension — the raw automation/hours answers directly. Returns null when
 * neither is available (old stored context without `scoreDrivers`, or an
 * unrecognised area) so callers can render nothing, matching the graceful-
 * degradation convention (types/diagnostic.ts `scoreDrivers?`).
 *
 * `item.area` is the canonical (never-translated) area id — it is compared
 * literally against `'Automation Coverage'` and used to index
 * `AREA_TO_DIMENSION` regardless of locale, same rule as every other
 * canonical id in this codebase.
 */
export function buildEvidenceUsed(
  item: { area: string },
  scoreDrivers: Record<string, Array<{ label: string }>> | null | undefined,
  quantitative: { currentAutomationPct: number | null; targetAutomationPct: number | null; totalManualHoursWeekly: number | null },
  locale: Locale = 'en',
): string[] | null {
  if (item.area === 'Automation Coverage') {
    const chips: string[] = []
    if (quantitative.currentAutomationPct !== null && quantitative.targetAutomationPct !== null) {
      chips.push(
        locale === 'id'
          ? `Otomasi ${fmtGap(quantitative.currentAutomationPct, locale)} → target ${fmtGap(quantitative.targetAutomationPct, locale)}`
          : `Automation ${fmtGap(quantitative.currentAutomationPct, locale)} → target ${fmtGap(quantitative.targetAutomationPct, locale)}`
      )
    }
    if (quantitative.totalManualHoursWeekly !== null) {
      chips.push(
        locale === 'id'
          ? `Jam kerja manual ${quantitative.totalManualHoursWeekly}/minggu`
          : `Manual hours ${quantitative.totalManualHoursWeekly}/week`
      )
    }
    return chips.length > 0 ? chips : null
  }

  const dim = AREA_TO_DIMENSION[item.area]
  if (!dim || !scoreDrivers || !scoreDrivers[dim] || scoreDrivers[dim].length === 0) return null
  return scoreDrivers[dim].slice(0, 2).map((d) => d.label)
}

const ROI_INPUT_LABELS: Record<Locale, Record<string, string>> = {
  en: {
    'manual hours/week': 'Manual hours logged',
    'budget': 'Budget range provided',
    'FTE count': 'Team size (FTE) provided',
  },
  id: {
    'manual hours/week': 'Jam kerja manual tercatat',
    'budget': 'Kisaran anggaran diberikan',
    'FTE count': 'Jumlah karyawan penuh waktu (FTE) diberikan',
  },
}

/**
 * Phase 2.3 — "Confidence" reasoning. `calculations.missingInputs` already
 * lists exactly which of the 3 ROI inputs (services/deepDiagnostic.ts
 * `calculateROI`) were missing — this only inverts it into a "known vs not
 * provided" sentence pair; it never changes `confidenceLevel` itself.
 */
export function buildConfidenceReasoning(missingInputs: string[], locale: Locale = 'en'): string[] {
  const labels = ROI_INPUT_LABELS[locale]
  const known = Object.entries(labels)
    .filter(([key]) => !missingInputs.includes(key))
    .map(([, label]) => label)
  const missing = missingInputs.map((key) => labels[key] ?? key)

  const parts: string[] = []
  if (locale === 'id') {
    if (known.length > 0) parts.push(`Diketahui: ${known.join(', ')}`)
    if (missing.length > 0) parts.push(`Belum diberikan: ${missing.join(', ')}`)
    return parts
  }
  if (known.length > 0) parts.push(`Known: ${known.join(', ')}`)
  if (missing.length > 0) parts.push(`Not provided: ${missing.join(', ')}`)
  return parts
}
