/**
 * View model for the "Your website" block on the Deep Diagnostic report
 * (ADR-022). The bridge adds `web_context` / `web_profile` / `website_insights`
 * to the AI result only when the user gave a website; this turns them into
 * localized facts + notes. Returns null when no website was involved, so the
 * report is unchanged for everyone else.
 */
type Locale = 'en' | 'id'
type LlmResult = Record<string, any>

export interface WebsiteInsightsView {
  state: 'found' | 'partial' | 'unavailable' | 'social_only' | 'document'
  /** Where the profile came from; the block title follows it. */
  source: 'website' | 'document'
  facts: { label: string; value: string }[]
  insights: string[]
  note: string | null
}

const INDUSTRY: Record<string, [string, string]> = {
  retail_ecommerce: ['Retail / e-commerce', 'Ritel / e-commerce'],
  manufacturing: ['Manufacturing', 'Manufaktur'],
  logistics: ['Logistics', 'Logistik'],
  food_beverage: ['Food & beverage', 'Makanan & minuman'],
  healthcare: ['Healthcare', 'Kesehatan'],
  education: ['Education', 'Pendidikan'],
  finance: ['Finance', 'Keuangan'],
  professional_services: ['Professional services', 'Jasa profesional'],
  technology_software: ['Technology / software', 'Teknologi / perangkat lunak'],
  hospitality_travel: ['Hospitality / travel', 'Perhotelan / perjalanan'],
  real_estate_construction: ['Real estate / construction', 'Properti / konstruksi'],
  agriculture: ['Agriculture', 'Pertanian'],
  media_creative: ['Media / creative', 'Media / kreatif'],
  nonprofit_government: ['Non-profit / government', 'Nirlaba / pemerintah'],
  other: ['Other', 'Lainnya'],
}
const MODEL: Record<string, [string, string]> = {
  b2b: ['B2B', 'B2B'],
  b2c: ['B2C', 'B2C'],
  b2b2c: ['B2B2C', 'B2B2C'],
  marketplace: ['Marketplace', 'Marketplace'],
  saas: ['SaaS', 'SaaS'],
  services: ['Services', 'Jasa'],
}
const SIGNAL: Record<string, [string, string]> = {
  ecommerce_platform: ['Online store', 'Toko online'],
  online_booking: ['Online booking', 'Pemesanan online'],
  customer_portal: ['Customer portal', 'Portal pelanggan'],
  mobile_app: ['Mobile app', 'Aplikasi mobile'],
  api_or_integrations: ['APIs / integrations', 'API / integrasi'],
  chat_support: ['Chat support', 'Dukungan chat'],
  analytics_tracking: ['Analytics', 'Analitik'],
  crm_forms: ['Lead / contact forms', 'Formulir kontak / lead'],
}

const pick = (m: Record<string, [string, string]>, k: unknown, l: Locale): string | null =>
  typeof k === 'string' && m[k] ? m[k][l === 'id' ? 1 : 0] : null

export function buildWebsiteInsightsView(llm: LlmResult | null | undefined, locale: Locale): WebsiteInsightsView | null {
  const status = llm?.web_context
  if (!llm || typeof status !== 'string') return null
  const id = locale === 'id'

  if (status === 'social_only') {
    return {
      state: 'social_only', source: 'website', facts: [], insights: [],
      note: id
        ? 'Alamat yang Anda berikan adalah halaman media sosial atau marketplace, yang tidak kami baca. Analisis ini hanya berdasarkan jawaban Anda.'
        : 'The address you gave is a social-media or marketplace page, which we do not read. This analysis is based on your answers only.',
    }
  }

  const p = llm.web_profile && typeof llm.web_profile === 'object' ? llm.web_profile : null
  if (!p || (status !== 'ok' && status !== 'partial' && status !== 'document')) {
    return {
      state: 'unavailable', source: 'website', facts: [], insights: [],
      note: id
        ? 'Kami tidak dapat membaca website Anda, jadi analisis ini hanya berdasarkan jawaban Anda. Skor Anda tidak terpengaruh.'
        : 'We could not read your website, so this analysis is based on your answers only. Your score is not affected.',
    }
  }

  const facts: { label: string; value: string }[] = []
  const industry = pick(INDUSTRY, p.industry, locale)
  if (industry) facts.push({ label: id ? 'Industri' : 'Industry', value: industry })
  const model = pick(MODEL, p.business_model, locale)
  if (model) facts.push({ label: id ? 'Model bisnis' : 'Business model', value: model })
  const products = Array.isArray(p.products) ? p.products.filter((x: unknown) => typeof x === 'string' && x.trim()).slice(0, 5) : []
  if (products.length) facts.push({ label: id ? 'Penawaran' : 'Offerings', value: products.join(' · ') })
  const signals = (Array.isArray(p.tech_signals) ? p.tech_signals : [])
    .map((s: unknown) => pick(SIGNAL, s, locale)).filter((x: string | null): x is string => !!x)
  if (signals.length) facts.push({ label: id ? 'Sinyal digital' : 'Digital signals', value: signals.join(' · ') })

  const insights = (Array.isArray(llm.website_insights) ? llm.website_insights : [])
    .filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 3)

  if (status === 'document') {
    return {
      state: 'document', source: 'document', facts, insights,
      note: id
        ? 'Dibaca otomatis dari dokumen yang Anda lampirkan dan bisa tidak lengkap. Tidak mengubah skor Anda.'
        : 'Read automatically from the document you attached and may be incomplete. It does not change your score.',
    }
  }

  return {
    state: status === 'ok' ? 'found' : 'partial',
    source: 'website',
    facts, insights,
    note: id
      ? 'Dibaca otomatis dari halaman publik website Anda dan bisa tidak lengkap. Tidak mengubah skor Anda.'
      : 'Read automatically from your public website pages and may be incomplete. It does not change your score.',
  }
}
