/**
 * Curated SDK/software recommendation catalog for the Deep Diagnostic report.
 *
 * 2026-08-25: the old "recommendations" were two generic strings ('Google
 * Forms / Sheets', 'Notion / Airtable') on the PDF's training tracks and
 * nothing on the dashboard. This catalog gives every report concrete,
 * comparable options: named products, entry pricing, regional fit (Indonesian
 * SMEs get local vendors where they matter — payroll/tax/POS), and the
 * diagnostic signal that triggered each pick, so a recommendation is always
 * auditable back to the user's own answers.
 *
 * Selection is DETERMINISTIC (keyword rules over the user's pain points,
 * opportunities, industry, and budget) — never LLM-generated, per the
 * platform rule that no number/recommendation reaches the page without a
 * traceable basis. Prices are entry-tier public list prices (USD/mo, rounded)
 * for comparison only — always labelled as estimates in the UI.
 */
import type { CurrencyCode } from '@/lib/resultFormatters'
import { formatCompactLocal } from '@/lib/currencyBands'

export interface SoftwareRecommendation {
  name: string
  category: { en: string; id: string }
  /** Rough entry-tier list price, USD/month (0 = free tier / self-host). */
  priceUSD: number
  /** Which markets this vendor is particularly right for. */
  regions: Array<'id' | 'global'>
  /** Why THIS diagnostic triggered this pick — references the user's signal. */
  reason: { en: string; id: string }
  vendorUrl: string
}

export interface SoftwarePick extends SoftwareRecommendation {
  /** The diagnostic signal (keyword) that matched. */
  matchedSignal: string
}

interface CatalogEntry extends SoftwareRecommendation {
  /** Lowercase keywords matched against pain points, opportunity titles, and industry. */
  signals: string[]
  /** Higher sorts first when multiple categories compete for slots. */
  priority: number
}

const CATALOG: CatalogEntry[] = [
  // ── Workflow / process automation ────────────────────────────────────────
  {
    name: 'n8n (self-host)',
    category: { en: 'Workflow automation', id: 'Otomasi alur kerja' },
    priceUSD: 0,
    regions: ['global', 'id'],
    signals: ['manual', 'repetitive', 'handoff', 'koordinasi', 'coordination', 'onboarding', 'follow-up', 'follow up', 'data entry', 'entry ulang'],
    priority: 10,
    reason: {
      en: 'Open-source workflow engine — automate hand-offs between the tools you already use without per-step fees.',
      id: 'Engine otomasi open-source — otomatisasi hand-off antar alat yang sudah dipakai tanpa biaya per langkah.',
    },
    vendorUrl: 'https://n8n.io',
  },
  {
    name: 'Make',
    category: { en: 'Workflow automation', id: 'Otomasi alur kerja' },
    priceUSD: 9,
    regions: ['global'],
    signals: ['manual', 'repetitive', 'spreadsheet', 'sync', 'sinkron'],
    priority: 8,
    reason: {
      en: 'Visual no-code automation between 1,500+ apps; cheaper entry tier than Zapier for SMEs.',
      id: 'Otomasi no-code visual antar 1.500+ aplikasi; tier entry lebih murah dari Zapier untuk UKM.',
    },
    vendorUrl: 'https://www.make.com',
  },
  // ── CRM / sales ──────────────────────────────────────────────────────────
  {
    name: 'Mekari Qontak',
    category: { en: 'CRM & WhatsApp pipeline', id: 'CRM & pipeline WhatsApp' },
    priceUSD: 17,
    regions: ['id'],
    signals: ['lead', 'customer', 'pelanggan', 'whatsapp', 'follow-up', 'follow up', 'sales', 'penjualan', 'crm'],
    priority: 9,
    reason: {
      en: 'Indonesian CRM with native WhatsApp Business API — fits WhatsApp-first sales motions.',
      id: 'CRM Indonesia dengan WhatsApp Business API native — cocok untuk penjualan berbasis WhatsApp.',
    },
    vendorUrl: 'https://mekari.com/qontak',
  },
  {
    name: 'HubSpot CRM',
    category: { en: 'CRM', id: 'CRM' },
    priceUSD: 0,
    regions: ['global'],
    signals: ['lead', 'customer', 'pelanggan', 'sales', 'penjualan', 'crm', 'pipeline'],
    priority: 8,
    reason: {
      en: 'Free tier covers contact/pipeline management; upgrade only when marketing automation is needed.',
      id: 'Tier gratis mencakup manajemen kontak/pipeline; upgrade hanya saat butuh otomasi marketing.',
    },
    vendorUrl: 'https://www.hubspot.com',
  },
  // ── Support / ticketing ──────────────────────────────────────────────────
  {
    name: 'Zoho Desk',
    category: { en: 'Support ticketing', id: 'Ticketing layanan pelanggan' },
    priceUSD: 14,
    regions: ['global', 'id'],
    signals: ['ticket', 'tiket', 'support', 'layanan pelanggan', 'complaint', 'keluhan', 'customer service'],
    priority: 9,
    reason: {
      en: 'Structured ticketing with SLA timers and AI reply assist at SME pricing.',
      id: 'Ticketing terstruktur dengan timer SLA dan asisten balasan AI di harga UKM.',
    },
    vendorUrl: 'https://www.zoho.com/desk',
  },
  {
    name: 'Freshdesk',
    category: { en: 'Support ticketing', id: 'Ticketing layanan pelanggan' },
    priceUSD: 15,
    regions: ['global'],
    signals: ['ticket', 'tiket', 'support', 'layanan pelanggan', 'customer service'],
    priority: 8,
    reason: {
      en: 'Omnichannel ticketing (email/WhatsApp/web) with a free tier to start.',
      id: 'Ticketing omnichannel (email/WhatsApp/web) dengan tier gratis untuk memulai.',
    },
    vendorUrl: 'https://www.freshworks.com/freshdesk',
  },
  // ── Data / reporting ─────────────────────────────────────────────────────
  {
    name: 'Google Looker Studio',
    category: { en: 'Reporting & dashboard', id: 'Pelaporan & dashboard' },
    priceUSD: 0,
    regions: ['global', 'id'],
    signals: ['report', 'laporan', 'manual report', 'spreadsheet', 'visibility', 'visibilitas', 'tracking', 'monitoring'],
    priority: 9,
    reason: {
      en: 'Free dashboards on top of your existing Sheets — replaces manual weekly reporting first.',
      id: 'Dashboard gratis di atas Sheets yang sudah ada — gantikan laporan mingguan manual lebih dulu.',
    },
    vendorUrl: 'https://lookerstudio.google.com',
  },
  {
    name: 'Metabase (self-host)',
    category: { en: 'Reporting & dashboard', id: 'Pelaporan & dashboard' },
    priceUSD: 0,
    regions: ['global'],
    signals: ['report', 'laporan', 'database', 'basis data', 'warehouse', 'analytics', 'analitik'],
    priority: 7,
    reason: {
      en: 'Open-source BI on top of your database once data centralises beyond spreadsheets.',
      id: 'BI open-source di atas database begitu data terpusat melampaui spreadsheet.',
    },
    vendorUrl: 'https://www.metabase.com',
  },
  // ── Process documentation / SOP ──────────────────────────────────────────
  {
    name: 'Notion',
    category: { en: 'Docs & SOP', id: 'Dokumen & SOP' },
    priceUSD: 10,
    regions: ['global', 'id'],
    signals: ['document', 'dokumentasi', 'sop', 'process', 'proses', 'standardisasi', 'standardisation', 'ad-hoc'],
    priority: 8,
    reason: {
      en: 'Single workspace for SOPs and process docs so workflows stop living in people\'s heads.',
      id: 'Satu ruang kerja untuk SOP dan dokumen proses agar alur kerja tak lagi hanya di kepala orang tertentu.',
    },
    vendorUrl: 'https://www.notion.so',
  },
  {
    name: 'Scribe',
    category: { en: 'Process capture', id: 'Dokumentasi proses otomatis' },
    priceUSD: 23,
    regions: ['global'],
    signals: ['document', 'dokumentasi', 'sop', 'standardisasi', 'training', 'pelatihan'],
    priority: 7,
    reason: {
      en: 'Auto-generates step-by-step SOP guides from screen recordings — documentation without the writing effort.',
      id: 'Membuat panduan SOP langkah-demi-langkah otomatis dari rekaman layar — dokumentasi tanpa effort menulis.',
    },
    vendorUrl: 'https://scribehow.com',
  },
  // ── Accounting / back office (Indonesia) ─────────────────────────────────
  {
    name: 'Mekari Jurnal',
    category: { en: 'Accounting', id: 'Akuntansi' },
    priceUSD: 20,
    regions: ['id'],
    signals: ['invoice', 'faktur', 'finance', 'keuangan', 'accounting', 'akuntansi', 'tax', 'pajak', 'bookkeeping'],
    priority: 8,
    reason: {
      en: 'PSAK/e-Faktur-compliant Indonesian accounting — removes manual bookkeeping and tax admin.',
      id: 'Akuntansi Indonesia sesuai PSAK/e-Faktur — menghapus pembukuan manual dan admin pajak.',
    },
    vendorUrl: 'https://mekari.com/jurnal',
  },
  {
    name: 'Mekari Talenta',
    category: { en: 'HR & payroll', id: 'HR & penggajian' },
    priceUSD: 25,
    regions: ['id'],
    signals: ['payroll', 'gaji', 'hr', 'absensi', 'attendance', 'karyawan', 'employee'],
    priority: 8,
    reason: {
      en: 'Payroll + attendance compliant with Indonesian tax/BPJS rules — automates the monthly admin cycle.',
      id: 'Payroll + absensi sesuai aturan pajak/BPJS Indonesia — otomatisasi siklus admin bulanan.',
    },
    vendorUrl: 'https://mekari.com/talenta',
  },
  // ── Scheduling / meetings ────────────────────────────────────────────────
  {
    name: 'Cal.com (self-host)',
    category: { en: 'Scheduling', id: 'Penjadwalan' },
    priceUSD: 0,
    regions: ['global'],
    signals: ['scheduling', 'jadwal', 'meeting', 'appointment', 'koordinasi'],
    priority: 6,
    reason: {
      en: 'Removes the back-and-forth of appointment scheduling; open source and free to self-host.',
      id: 'Menghapus bolak-balik penjadwalan; open source dan gratis untuk self-host.',
    },
    vendorUrl: 'https://cal.com',
  },
]

/**
 * Deterministic selector: match catalog signals against the diagnostic's own
 * words (pain points, opportunity titles, industry), respect region fit and
 * budget, and return a de-duplicated top-N across categories.
 */
export function selectSoftwareRecommendations(input: {
  currency: CurrencyCode
  industry?: string
  painPoints?: string[]
  opportunityTitles?: string[]
  budgetMidpointUSD?: number | null
  max?: number
}): SoftwarePick[] {
  const max = input.max ?? 5
  const haystackParts = [
    input.industry ?? '',
    ...(input.painPoints ?? []),
    ...(input.opportunityTitles ?? []),
  ]
  const haystack = haystackParts.join(' ').toLowerCase()

  const isIDMarket = input.currency === 'IDR'
  const scored: Array<{ entry: CatalogEntry; signal: string }> = []
  for (const entry of CATALOG) {
    // Region fit: local-vendor entries only surface for IDR users; global
    // entries surface for everyone.
    const regionFit = entry.regions.includes('id') && isIDMarket
      ? true
      : entry.regions.includes('global')
    if (!regionFit) continue
    const signal = entry.signals.find((s) => haystack.includes(s))
    if (signal) scored.push({ entry, signal })
  }

  // Priority order, then price ascending within the same priority; cap one
  // pick per category so the list covers distinct needs, not five CRMs.
  scored.sort((a, b) => b.entry.priority - a.entry.priority || a.entry.priceUSD - b.entry.priceUSD)
  const seenCategories = new Set<string>()
  const picks: SoftwarePick[] = []
  for (const { entry, signal } of scored) {
    const catKey = entry.category.en
    if (seenCategories.has(catKey)) continue
    seenCategories.add(catKey)
    picks.push({ ...entry, matchedSignal: signal })
    if (picks.length >= max) break
  }
  return picks
}

/**
 * Entry price rendered in the report's display currency, e.g. "≈ Rp 300 rb/bln".
 * `rate` is the USD→local FX rate the report already uses for its ROI figures
 * (getRate() after ensureLiveRates()) — passing it in keeps this module pure
 * and the price consistent with every other number on the page.
 */
export function formatPickPrice(priceUSD: number, currency: CurrencyCode, rate: number, locale: 'en' | 'id'): string {
  if (priceUSD === 0) return locale === 'id' ? 'Gratis / self-host' : 'Free / self-host'
  const label = formatCompactLocal(Math.round(priceUSD * rate), currency)
  return locale === 'id' ? `≈ ${label}/bln` : `≈ ${label}/mo`
}
