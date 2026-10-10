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

/**
 * Short signals ("pos", "form", "lead", "sku") must match as whole words —
 * as substrings they hit "proposals", "information", "leadership". Longer
 * signals keep substring matching so "invoice" still matches "invoices".
 */
function signalMatches(haystack: string, signal: string): boolean {
  const sig = signal.trim()
  if (sig.length > 5) return haystack.includes(sig)
  const esc = sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${esc}(s|es)?([^a-z0-9]|$)`).test(haystack)
}

/** Markets the catalog distinguishes — derived from the operating country
 *  (intake question operating_country), else from the report currency. */
export type Market = 'id' | 'sg' | 'my' | 'au' | 'ae' | 'sa' | 'om' | 'in' | 'jp' | 'gb' | 'eu' | 'us'

export type PriceBasis =
  | 'per_user' | 'per_employee' | 'flat' | 'self_host'
  | 'per_location'     // per outlet/branch (POS)
  | 'transaction_fee'  // no subscription; a fee per payment (priceNote)
  | 'usage'            // metered (per page/message) — priceNote
  | 'quote'            // no public price — sales quote (priceNote optional)

const COUNTRY_MARKET: Record<string, Market> = {
  'Indonesia': 'id', 'Singapore': 'sg', 'Malaysia': 'my', 'Australia': 'au',
  'United Arab Emirates': 'ae', 'Saudi Arabia': 'sa', 'Oman': 'om', 'India': 'in',
  'Japan': 'jp', 'United Kingdom': 'gb', 'European Union': 'eu', 'United States': 'us',
}
const CURRENCY_MARKET: Partial<Record<CurrencyCode, Market>> = {
  IDR: 'id', SGD: 'sg', MYR: 'my', AUD: 'au', AED: 'ae', SAR: 'sa', OMR: 'om',
  INR: 'in', JPY: 'jp', GBP: 'gb', EUR: 'eu', USD: 'us',
}
/** Operating country wins; the currency is the fallback for older answers. */
export function resolveMarket(operatingCountry: string | null | undefined, currency: CurrencyCode): Market | null {
  if (operatingCountry && COUNTRY_MARKET[operatingCountry]) return COUNTRY_MARKET[operatingCountry]
  if (operatingCountry && operatingCountry !== 'Other') return null
  return CURRENCY_MARKET[currency] ?? null
}

export interface SoftwareRecommendation {
  name: string
  category: { en: string; id: string }
  /** Rough entry-tier list price, USD/month (0 = free tier / self-host). */
  priceUSD: number
  /**
   * What that price actually buys — the single most misleading omission in a
   * software table. "~ Rp 390.000/bln" beside Odoo reads as the cost of
   * running Odoo; it is the cost of ONE seat. A 20-person team reading the
   * flat number under-budgets by 20×, and the whole financial case built on
   * top of it stops being credible. Every entry must declare its basis.
   */
  priceBasis: PriceBasis
  /**
   * For bases a single monthly number can't express — 'transaction_fee',
   * 'usage', 'quote' — the rate as published (e.g. "2.9% + 30¢ per card
   * payment"). Shown instead of priceUSD.
   */
  priceNote?: { en: string; id: string }
  /** ISO date the price was last checked against the vendor's pricing page. */
  priceCheckedAt: string
  /** Where the vendor is a fit: 'global', or the markets it is local to. */
  regions: Array<'global' | Market>
  /** True when Aivory connects to it natively (integrations or Cerveau). */
  aivoryIntegration?: boolean
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
  /**
   * Org-size gate: 'mid' requires ≥50 FTEs, 'enterprise' ≥100 FTEs
   * (quantitative.fteCountInScope). SAP to a 5-person studio is noise, not
   * a recommendation — the diagnostic knows the team size, so use it.
   */
  minFTE?: number
}

const CATALOG: CatalogEntry[] = [
  // Workflow automation is deliberately absent: Aivory IS the automation
  // platform — recommending Make/n8n/Zapier sent clients to competitors.
  // ── CRM / sales ──────────────────────────────────────────────────────────
  {
    name: 'Mekari Qontak',
    category: { en: 'CRM & WhatsApp pipeline', id: 'CRM & pipeline WhatsApp' },
    priceUSD: 17,
    priceBasis: 'per_user',
    regions: ['id'],
    signals: ['lead', 'customer', 'pelanggan', 'whatsapp', 'follow-up', 'follow up', 'sales', 'penjualan', 'crm'],
    priority: 9,
    reason: {
      en: 'Indonesian CRM with native WhatsApp Business API — fits WhatsApp-first sales motions.',
      id: 'CRM Indonesia dengan WhatsApp Business API native — cocok untuk penjualan berbasis WhatsApp.',
    },
    vendorUrl: 'https://mekari.com/qontak',
    priceCheckedAt: '2026-08-27',
  },
  {
    name: 'HubSpot CRM',
    aivoryIntegration: true,
    category: { en: 'CRM', id: 'CRM' },
    priceUSD: 0,
    priceBasis: 'per_user',
    regions: ['global'],
    signals: ['lead', 'customer', 'pelanggan', 'sales', 'penjualan', 'crm', 'pipeline'],
    priority: 8,
    reason: {
      en: 'Free tier covers contact/pipeline management; upgrade only when marketing automation is needed.',
      id: 'Tier gratis mencakup manajemen kontak/pipeline; upgrade hanya saat butuh otomasi marketing.',
    },
    vendorUrl: 'https://www.hubspot.com',
    priceCheckedAt: '2026-08-27',
  },
  // ── Support / ticketing ──────────────────────────────────────────────────
  {
    name: 'Zoho Desk',
    category: { en: 'Support ticketing', id: 'Ticketing layanan pelanggan' },
    priceUSD: 14,
    priceBasis: 'per_user',
    regions: ['global', 'id'],
    signals: ['ticket', 'tiket', 'support', 'layanan pelanggan', 'complaint', 'keluhan', 'customer service'],
    priority: 9,
    reason: {
      en: 'Structured ticketing with SLA timers and AI reply assist at SME pricing.',
      id: 'Ticketing terstruktur dengan timer SLA dan asisten balasan AI di harga UKM.',
    },
    vendorUrl: 'https://www.zoho.com/desk',
    priceCheckedAt: '2026-08-27',
  },
  {
    name: 'Freshdesk',
    category: { en: 'Support ticketing', id: 'Ticketing layanan pelanggan' },
    priceUSD: 15,
    priceBasis: 'per_user',
    regions: ['global'],
    signals: ['ticket', 'tiket', 'support', 'layanan pelanggan', 'customer service'],
    priority: 8,
    reason: {
      en: 'Omnichannel ticketing (email/WhatsApp/web) with a free tier to start.',
      id: 'Ticketing omnichannel (email/WhatsApp/web) dengan tier gratis untuk memulai.',
    },
    vendorUrl: 'https://www.freshworks.com/freshdesk',
    priceCheckedAt: '2026-08-27',
  },
  // ── Data / reporting ─────────────────────────────────────────────────────
  {
    name: 'Google Looker Studio',
    category: { en: 'Reporting & dashboard', id: 'Pelaporan & dashboard' },
    priceUSD: 0,
    priceBasis: 'self_host',
    regions: ['global', 'id'],
    signals: ['report', 'laporan', 'manual report', 'spreadsheet', 'visibility', 'visibilitas', 'tracking', 'monitoring'],
    priority: 9,
    reason: {
      en: 'Free dashboards on top of your existing Sheets — replaces manual weekly reporting first.',
      id: 'Dashboard gratis di atas Sheets yang sudah ada — gantikan laporan mingguan manual lebih dulu.',
    },
    vendorUrl: 'https://lookerstudio.google.com',
    priceCheckedAt: '2026-08-27',
  },
  {
    name: 'Metabase (self-host)',
    category: { en: 'Reporting & dashboard', id: 'Pelaporan & dashboard' },
    priceUSD: 0,
    priceBasis: 'self_host',
    regions: ['global'],
    signals: ['report', 'laporan', 'database', 'basis data', 'warehouse', 'analytics', 'analitik'],
    priority: 7,
    reason: {
      en: 'Open-source BI on top of your database once data centralises beyond spreadsheets.',
      id: 'BI open-source di atas database begitu data terpusat melampaui spreadsheet.',
    },
    vendorUrl: 'https://www.metabase.com',
    priceCheckedAt: '2026-08-27',
  },
  // ── Process documentation / SOP ──────────────────────────────────────────
  {
    name: 'Notion',
    aivoryIntegration: true,
    category: { en: 'Docs & SOP', id: 'Dokumen & SOP' },
    priceUSD: 10,
    priceBasis: 'per_user',
    regions: ['global', 'id'],
    signals: ['document', 'dokumentasi', 'sop', 'process', 'proses', 'standardisasi', 'standardisation', 'ad-hoc'],
    priority: 8,
    reason: {
      en: 'Single workspace for SOPs and process docs so workflows stop living in people\'s heads.',
      id: 'Satu ruang kerja untuk SOP dan dokumen proses agar alur kerja tak lagi hanya di kepala orang tertentu.',
    },
    vendorUrl: 'https://www.notion.so',
    priceCheckedAt: '2026-08-27',
  },
  {
    name: 'Scribe',
    category: { en: 'Process capture', id: 'Dokumentasi proses otomatis' },
    priceUSD: 23,
    priceBasis: 'per_user',
    regions: ['global'],
    signals: ['document', 'dokumentasi', 'sop', 'standardisasi', 'training', 'pelatihan'],
    priority: 7,
    reason: {
      en: 'Auto-generates step-by-step SOP guides from screen recordings — documentation without the writing effort.',
      id: 'Membuat panduan SOP langkah-demi-langkah otomatis dari rekaman layar — dokumentasi tanpa effort menulis.',
    },
    vendorUrl: 'https://scribehow.com',
    priceCheckedAt: '2026-08-27',
  },
  // ── Accounting / back office (Indonesia) ─────────────────────────────────
  {
    name: 'Mekari Jurnal',
    category: { en: 'Accounting', id: 'Akuntansi' },
    priceUSD: 20,
    priceBasis: 'flat',
    regions: ['id'],
    signals: ['invoice', 'faktur', 'finance', 'keuangan', 'accounting', 'akuntansi', 'tax', 'pajak', 'bookkeeping'],
    priority: 8,
    reason: {
      en: 'PSAK/e-Faktur-compliant Indonesian accounting — removes manual bookkeeping and tax admin.',
      id: 'Akuntansi Indonesia sesuai PSAK/e-Faktur — menghapus pembukuan manual dan admin pajak.',
    },
    vendorUrl: 'https://mekari.com/jurnal',
    priceCheckedAt: '2026-08-27',
  },
  {
    name: 'Mekari Talenta',
    category: { en: 'HR & payroll', id: 'HR & penggajian' },
    priceUSD: 25,
    priceBasis: 'per_employee',
    regions: ['id'],
    signals: ['payroll', 'gaji', 'hr', 'absensi', 'attendance', 'karyawan', 'employee'],
    priority: 8,
    reason: {
      en: 'Payroll + attendance compliant with Indonesian tax/BPJS rules — automates the monthly admin cycle.',
      id: 'Payroll + absensi sesuai aturan pajak/BPJS Indonesia — otomatisasi siklus admin bulanan.',
    },
    vendorUrl: 'https://mekari.com/talenta',
    priceCheckedAt: '2026-08-27',
  },
  // ── Scheduling / meetings ────────────────────────────────────────────────
  {
    name: 'Cal.com (self-host)',
    category: { en: 'Scheduling', id: 'Penjadwalan' },
    priceUSD: 0,
    priceBasis: 'self_host',
    regions: ['global'],
    signals: ['scheduling', 'jadwal', 'meeting', 'appointment', 'koordinasi'],
    priority: 6,
    reason: {
      en: 'Removes the back-and-forth of appointment scheduling; open source and free to self-host.',
      id: 'Menghapus bolak-balik penjadwalan; open source dan gratis untuk self-host.',
    },
    vendorUrl: 'https://cal.com',
    priceCheckedAt: '2026-08-27',
  },
  // ── ERP suite ────────────────────────────────────────────────────────────
  // 2026-08-25: the catalog had no ERP tier at all — SMEs outgrowing
  // spreadsheets were offered point tools forever. Ordered from lightest to
  // heaviest; the minFTE gate keeps SAP/Dynamics away from small teams.
  {
    name: 'Odoo',
    aivoryIntegration: true,
    category: { en: 'ERP suite', id: 'Suite ERP' },
    priceUSD: 25,
    priceBasis: 'per_user',
    regions: ['global', 'id'],
    signals: ['erp', 'inventory', 'inventori', 'stok', 'stock', 'warehouse', 'gudang', 'manufacturing', 'manufaktur', 'supply chain', 'rantai pasok', 'accounting', 'akuntansi', 'terputus', 'disconnected', 'fragmented'],
    priority: 8,
    reason: {
      en: 'Modular open-source ERP (CRM, inventory, accounting, manufacturing in one) — the standard step up when point tools stop talking to each other.',
      id: 'ERP open-source modular (CRM, inventory, akuntansi, manufaktur dalam satu) — langkah standar saat alat point-to-point tak saling terhubung.',
    },
    vendorUrl: 'https://www.odoo.com',
    priceCheckedAt: '2026-08-27',
  },
  {
    name: 'ERPNext (self-host)',
    category: { en: 'ERP suite', id: 'Suite ERP' },
    priceUSD: 0,
    priceBasis: 'self_host',
    regions: ['global'],
    signals: ['erp', 'inventory', 'inventori', 'manufacturing', 'manufaktur', 'accounting', 'akuntansi', 'disconnected', 'terputus'],
    priority: 7,
    reason: {
      en: 'Full open-source ERP with no per-user fees — strongest fit when budget is tight but data must centralise.',
      id: 'ERP open-source lengkap tanpa biaya per pengguna — paling cocok saat anggaran ketat tapi data harus terpusat.',
    },
    vendorUrl: 'https://erpnext.com',
    priceCheckedAt: '2026-08-27',
  },
  {
    name: 'SAP Business One',
    category: { en: 'ERP suite', id: 'Suite ERP' },
    priceUSD: 56,
    priceBasis: 'per_user',
    regions: ['global', 'id'],
    minFTE: 50,
    signals: ['erp', 'manufacturing', 'manufaktur', 'supply chain', 'rantai pasok', 'inventory', 'inventori', 'finance', 'keuangan', 'compliance', 'kepatuhan'],
    priority: 8,
    reason: {
      en: 'SAP\'s SME-grade ERP — for orgs past ~50 staff needing production, supply-chain and statutory reporting in one auditable system.',
      id: 'ERP kelas UKM dari SAP — untuk organisasi ~50+ staf yang butuh produksi, rantai pasok, dan pelaporan statutori dalam satu sistem ter-audit.',
    },
    vendorUrl: 'https://www.sap.com/products/erp/business-one',
    priceCheckedAt: '2026-08-27',
  },
  {
    name: 'Microsoft Dynamics 365',
    category: { en: 'ERP + CRM suite', id: 'Suite ERP + CRM' },
    priceUSD: 65,
    priceBasis: 'per_user',
    regions: ['global'],
    minFTE: 50,
    signals: ['erp', 'crm', 'sales', 'penjualan', 'finance', 'keuangan', 'supply chain', 'rantai pasok', 'excel', 'microsoft', 'office'],
    priority: 7,
    reason: {
      en: 'Unified ERP+CRM on the Microsoft stack — natural when the team already lives in Excel/Outlook/Teams.',
      id: 'ERP+CRM terpadu di ekosistem Microsoft — natural jika tim sudah kerja di Excel/Outlook/Teams.',
    },
    vendorUrl: 'https://dynamics.microsoft.com',
    priceCheckedAt: '2026-08-27',
  },
  // ── CRM alternates (compete with Qontak/HubSpot within the CRM slot) ────
  {
    name: 'Zoho CRM',
    category: { en: 'CRM', id: 'CRM' },
    priceUSD: 14,
    priceBasis: 'per_user',
    regions: ['global', 'id'],
    signals: ['crm', 'lead', 'sales', 'penjualan', 'pipeline', 'customer', 'pelanggan'],
    priority: 7,
    reason: {
      en: 'Budget-friendly CRM with the deepest feature list per dollar at SME tier.',
      id: 'CRM hemat anggaran dengan fitur terlengkap per rupiah di tier UKM.',
    },
    vendorUrl: 'https://www.zoho.com/crm',
    priceCheckedAt: '2026-08-27',
  },
  {
    name: 'Pipedrive',
    category: { en: 'CRM (sales pipeline)', id: 'CRM (pipeline penjualan)' },
    priceUSD: 14,
    priceBasis: 'per_user',
    regions: ['global'],
    signals: ['pipeline', 'deal', 'sales', 'penjualan', 'follow-up', 'follow up'],
    priority: 7,
    reason: {
      en: 'Pipeline-first CRM — the simplest visual deal tracker for sales-led teams.',
      id: 'CRM berorientasi pipeline — pelacak deal visual paling sederhana untuk tim sales.',
    },
    vendorUrl: 'https://www.pipedrive.com',
    priceCheckedAt: '2026-08-27',
  },
  {
    name: 'Salesforce Sales Cloud',
    aivoryIntegration: true,
    category: { en: 'CRM (enterprise)', id: 'CRM (enterprise)' },
    priceUSD: 80,
    priceBasis: 'per_user',
    regions: ['global'],
    minFTE: 100,
    signals: ['crm', 'sales', 'penjualan', 'enterprise', 'scaling', 'skuala', 'forecast', 'proyeksi'],
    priority: 6,
    reason: {
      en: 'Enterprise CRM platform — only worth its admin overhead at serious scale; consider Odoo/Dynamics below 100 staff.',
      id: 'Platform CRM enterprise — layak di atas beban adminnya hanya di skala besar; pertimbangkan Odoo/Dynamics di bawah 100 staf.',
    },
    vendorUrl: 'https://www.salesforce.com',
    priceCheckedAt: '2026-08-27',
  },
  // ── 2026-10-11 enrichment — prices checked 2026-10-11 (sources in PR #61).
  // Document AI / OCR — paper, photographed notes, invoices to structured data
  {
    name: 'Google Document AI',
    category: { en: 'Document AI / OCR', id: 'Document AI / OCR' },
    priceUSD: 0,
    priceBasis: 'usage',
    priceNote: { en: '$1.50 per 1,000 pages (OCR)', id: '$1,50 per 1.000 halaman (OCR)' },
    priceCheckedAt: '2026-10-11',
    regions: ['global'],
    signals: ['photo', 'foto', 'scan', 'ocr', 'receipt', 'struk', 'pdf', 'paper', 'kertas', 'handwritten', 'tulisan tangan', 'notebook', 'buku catatan', 're-key', 'rekey', 'input ulang', 're-entry', 'entry ulang'],
    priority: 9,
    reason: {
      en: 'Turns photographed notes, receipts and PDFs into structured data — removes the manual re-keying step your answers describe.',
      id: 'Mengubah foto catatan, struk, dan PDF menjadi data terstruktur — menghapus langkah input ulang manual yang Anda sebutkan.',
    },
    vendorUrl: 'https://cloud.google.com/document-ai',
  },
  // E-commerce
  {
    name: 'Shopify',
    category: { en: 'E-commerce storefront', id: 'Toko online' },
    priceUSD: 39,
    priceBasis: 'flat',
    priceCheckedAt: '2026-10-11',
    regions: ['global'],
    aivoryIntegration: true,
    signals: ['e-commerce', 'ecommerce', 'online store', 'toko online', 'webstore', 'shopify', 'online order', 'pesanan online'],
    priority: 8,
    reason: {
      en: 'Hosted online store with orders, payments and inventory in one place — and Aivory connects to it directly.',
      id: 'Toko online siap pakai dengan pesanan, pembayaran, dan stok di satu tempat — dan Aivory terhubung langsung ke Shopify.',
    },
    vendorUrl: 'https://www.shopify.com/pricing',
  },
  // Point of sale
  {
    name: 'Moka POS',
    category: { en: 'Point of sale', id: 'Kasir (POS)' },
    priceUSD: 18,
    priceBasis: 'per_location',
    priceCheckedAt: '2026-10-11',
    regions: ['id'],
    signals: ['pos', 'kasir', 'cashier', 'outlet', 'restaurant', 'restoran', 'cafe', 'kafe', 'food & beverages', 'f&b', 'sales recap', 'rekap penjualan'],
    priority: 9,
    reason: {
      en: 'Indonesian POS that records every sale per outlet automatically — replaces end-of-day manual recaps.',
      id: 'POS Indonesia yang mencatat setiap penjualan per outlet secara otomatis — menggantikan rekap manual di akhir hari.',
    },
    vendorUrl: 'https://www.mokapos.com',
  },
  {
    name: 'Foodics',
    category: { en: 'Point of sale', id: 'Kasir (POS)' },
    priceUSD: 0,
    priceBasis: 'quote',
    priceNote: { en: 'Per-branch bundles, quoted by sales', id: 'Paket per cabang, harga lewat sales' },
    priceCheckedAt: '2026-10-11',
    regions: ['sa', 'ae', 'om'],
    signals: ['pos', 'cashier', 'outlet', 'branch', 'restaurant', 'cafe', 'food & beverages', 'f&b', 'sales recap'],
    priority: 9,
    reason: {
      en: 'The leading Gulf restaurant POS — branch-level sales, inventory and ZATCA-ready invoicing.',
      id: 'POS restoran terdepan di kawasan Teluk — penjualan per cabang, stok, dan faktur siap ZATCA.',
    },
    vendorUrl: 'https://www.foodics.com',
  },
  {
    name: 'Square POS',
    category: { en: 'Point of sale', id: 'Kasir (POS)' },
    priceUSD: 0,
    priceBasis: 'transaction_fee',
    priceNote: { en: 'Free plan · 2.6% + 15¢ per in-person card payment (US)', id: 'Paket gratis · 2,6% + 15¢ per pembayaran kartu langsung (AS)' },
    priceCheckedAt: '2026-10-11',
    regions: ['us', 'au', 'gb', 'jp', 'eu'],
    signals: ['pos', 'cashier', 'outlet', 'store', 'restaurant', 'cafe', 'retail', 'food & beverages', 'sales recap'],
    priority: 8,
    reason: {
      en: 'No-subscription POS — every sale is recorded and reported automatically from day one.',
      id: 'POS tanpa langganan — setiap penjualan tercatat dan dilaporkan otomatis sejak hari pertama.',
    },
    vendorUrl: 'https://squareup.com/us/en/point-of-sale',
  },
  // Inventory
  {
    name: 'Zoho Inventory',
    category: { en: 'Inventory & warehouse', id: 'Stok & gudang' },
    priceUSD: 39,
    priceBasis: 'flat',
    priceCheckedAt: '2026-10-11',
    regions: ['global'],
    signals: ['stock', 'stok', 'inventory', 'inventori', 'warehouse', 'gudang', 'sku', 'persediaan', 'bahan baku', 'raw material', 'stockout', 'kehabisan'],
    priority: 8,
    reason: {
      en: 'Live stock levels with reorder alerts — no more finding out about stock-outs after a manual count.',
      id: 'Stok real-time dengan peringatan pemesanan ulang — tidak perlu lagi tahu stok habis setelah hitung manual.',
    },
    vendorUrl: 'https://www.zoho.com/inventory/pricing',
  },
  // Delivery & fleet
  {
    name: 'Onfleet',
    category: { en: 'Delivery & fleet management', id: 'Manajemen pengiriman & armada' },
    priceUSD: 619,
    priceBasis: 'flat',
    priceCheckedAt: '2026-10-11',
    regions: ['global'],
    minFTE: 16,
    signals: ['delivery', 'pengiriman', 'dispatch', 'dispatcher', 'courier', 'kurir', 'shipment', 'fleet', 'armada', 'driver', 'route', 'rute', 'proof of delivery', 'pod', 'status update'],
    priority: 10,
    reason: {
      en: 'Dispatch, live tracking and proof of delivery with automatic customer status updates — removes manual status chasing.',
      id: 'Dispatch, pelacakan langsung, dan bukti pengiriman dengan update status otomatis ke pelanggan — menghapus follow-up status manual.',
    },
    vendorUrl: 'https://onfleet.com/pricing',
  },
  // Payments
  {
    name: 'Xendit',
    category: { en: 'Payment gateway', id: 'Payment gateway' },
    priceUSD: 0,
    priceBasis: 'transaction_fee',
    priceNote: { en: 'No subscription · VA Rp 4,000 · QRIS ~0.7% per transaction', id: 'Tanpa langganan · VA Rp 4.000 · QRIS ~0,7% per transaksi' },
    priceCheckedAt: '2026-10-11',
    regions: ['id', 'my'],
    signals: ['payment', 'pembayaran', 'invoice', 'tagihan', 'penagihan', 'collection', 'chasing payment', 'billing', 'checkout', 'transfer', 'reconciliation', 'rekonsiliasi'],
    priority: 8,
    reason: {
      en: 'Virtual accounts, QRIS and e-wallets with automatic payment matching — ends manual payment chasing and reconciliation.',
      id: 'Virtual account, QRIS, dan e-wallet dengan pencocokan pembayaran otomatis — mengakhiri penagihan dan rekonsiliasi manual.',
    },
    vendorUrl: 'https://www.xendit.co/en-id/pricing/',
  },
  {
    name: 'Stripe',
    category: { en: 'Payment gateway', id: 'Payment gateway' },
    priceUSD: 0,
    priceBasis: 'transaction_fee',
    priceNote: { en: 'No subscription · 2.9% + 30¢ per card payment (US)', id: 'Tanpa langganan · 2,9% + 30¢ per pembayaran kartu (AS)' },
    priceCheckedAt: '2026-10-11',
    regions: ['sg', 'my', 'au', 'ae', 'in', 'jp', 'gb', 'eu', 'us'],
    aivoryIntegration: true,
    signals: ['payment', 'invoice', 'collection', 'chasing payment', 'billing', 'checkout', 'subscription', 'reconciliation'],
    priority: 8,
    reason: {
      en: 'Card and invoice payments with automatic reconciliation — and Aivory connects to Stripe directly.',
      id: 'Pembayaran kartu dan invoice dengan rekonsiliasi otomatis — dan Aivory terhubung langsung ke Stripe.',
    },
    vendorUrl: 'https://stripe.com/pricing',
  },
  {
    name: 'Tap Payments',
    category: { en: 'Payment gateway', id: 'Payment gateway' },
    priceUSD: 0,
    priceBasis: 'quote',
    priceNote: { en: 'Per-transaction rate quoted by sales (mada, cards, Apple Pay)', id: 'Tarif per transaksi lewat sales (mada, kartu, Apple Pay)' },
    priceCheckedAt: '2026-10-11',
    regions: ['ae', 'sa', 'om'],
    signals: ['payment', 'invoice', 'collection', 'chasing payment', 'billing', 'checkout', 'reconciliation'],
    priority: 9,
    reason: {
      en: 'Gulf payment gateway with mada, KNET and Apple Pay — collects and reconciles local payments automatically.',
      id: 'Payment gateway Teluk dengan mada, KNET, dan Apple Pay — menagih dan merekonsiliasi pembayaran lokal otomatis.',
    },
    vendorUrl: 'https://www.tap.company',
  },
  // E-signature
  {
    name: 'DocuSign',
    category: { en: 'E-signature', id: 'Tanda tangan elektronik' },
    priceUSD: 45,
    priceBasis: 'per_user',
    priceCheckedAt: '2026-10-11',
    regions: ['global'],
    signals: ['contract', 'kontrak', 'signature', 'tanda tangan', 'agreement', 'perjanjian', 'proposal', 'legal', 'approval', 'persetujuan', 'po', 'purchase order'],
    priority: 7,
    reason: {
      en: 'Sends, signs and tracks contracts and approvals digitally — removes print-sign-scan loops.',
      id: 'Mengirim, menandatangani, dan melacak kontrak serta persetujuan secara digital — menghapus siklus cetak-tanda tangan-scan.',
    },
    vendorUrl: 'https://www.docusign.com/products-and-pricing',
  },
  // Accounting (regional)
  {
    name: 'Xero',
    category: { en: 'Accounting', id: 'Akuntansi' },
    priceUSD: 27,
    priceBasis: 'flat',
    priceCheckedAt: '2026-10-11',
    regions: ['au', 'gb', 'sg', 'my', 'us', 'eu'],
    signals: ['accounting', 'akuntansi', 'bookkeeping', 'pembukuan', 'invoice', 'reconciliation', 'rekonsiliasi', 'finance', 'keuangan', 'excel', 'tax', 'vat', 'gst'],
    priority: 8,
    reason: {
      en: 'Cloud accounting with bank feeds and automatic reconciliation — replaces spreadsheet bookkeeping.',
      id: 'Akuntansi cloud dengan bank feed dan rekonsiliasi otomatis — menggantikan pembukuan di spreadsheet.',
    },
    vendorUrl: 'https://www.xero.com/us/pricing-plans/',
  },
  {
    name: 'Zoho Books',
    category: { en: 'Accounting', id: 'Akuntansi' },
    priceUSD: 20,
    priceBasis: 'flat',
    priceCheckedAt: '2026-10-11',
    regions: ['ae', 'om', 'in', 'global'],
    signals: ['accounting', 'bookkeeping', 'invoice', 'reconciliation', 'finance', 'excel', 'tax', 'vat', 'gst'],
    priority: 7,
    reason: {
      en: 'VAT/GST-ready cloud accounting for SMEs — invoicing, bank reconciliation and reports without spreadsheets.',
      id: 'Akuntansi cloud siap PPN/GST untuk UKM — invoice, rekonsiliasi bank, dan laporan tanpa spreadsheet.',
    },
    vendorUrl: 'https://www.zoho.com/books/pricing/',
  },
  {
    name: 'Qoyod',
    category: { en: 'Accounting', id: 'Akuntansi' },
    priceUSD: 64,
    priceBasis: 'flat',
    priceCheckedAt: '2026-10-11',
    regions: ['sa'],
    signals: ['accounting', 'bookkeeping', 'invoice', 'reconciliation', 'finance', 'excel', 'tax', 'vat', 'zatca', 'e-invoice', 'fatoora'],
    priority: 9,
    reason: {
      en: 'Saudi cloud accounting with ZATCA (Fatoora) e-invoicing — compliance and bookkeeping in one place.',
      id: 'Akuntansi cloud Saudi dengan e-invoicing ZATCA (Fatoora) — kepatuhan dan pembukuan dalam satu tempat.',
    },
    vendorUrl: 'https://www.qoyod.com/en/',
  },
  // Collaboration
  {
    name: 'Asana',
    category: { en: 'Project & task management', id: 'Manajemen proyek & tugas' },
    priceUSD: 13.5,
    priceBasis: 'per_user',
    priceCheckedAt: '2026-10-11',
    regions: ['global'],
    aivoryIntegration: true,
    signals: ['project', 'proyek', 'task', 'tugas', 'deadline', 'tenggat', 'handoff', 'hand-off', 'coordination', 'koordinasi', 'follow-up', 'follow up', 'approval'],
    priority: 7,
    reason: {
      en: 'Shared task boards with owners and due dates — hand-offs stop living in chat threads, and Aivory connects to Asana.',
      id: 'Papan tugas bersama dengan penanggung jawab dan tenggat — hand-off tidak lagi tercecer di chat, dan Aivory terhubung ke Asana.',
    },
    vendorUrl: 'https://asana.com/pricing',
  },
  {
    name: 'Slack',
    category: { en: 'Team communication', id: 'Komunikasi tim' },
    priceUSD: 8.75,
    priceBasis: 'per_user',
    priceCheckedAt: '2026-10-11',
    regions: ['global'],
    aivoryIntegration: true,
    signals: ['internal communication', 'komunikasi internal', 'whatsapp group', 'grup whatsapp', 'chat', 'coordination', 'koordinasi', 'notification', 'notifikasi', 'alert'],
    priority: 5,
    reason: {
      en: 'Team channels where Aivory agents can post alerts and approvals — replaces scattered WhatsApp groups for internal ops.',
      id: 'Kanal tim tempat agen Aivory bisa mengirim notifikasi dan persetujuan — menggantikan grup WhatsApp yang tersebar untuk operasional internal.',
    },
    vendorUrl: 'https://slack.com/pricing',
  },
  {
    name: 'Google Workspace',
    category: { en: 'Office suite & forms', id: 'Office suite & formulir' },
    priceUSD: 8.4,
    priceBasis: 'per_user',
    priceCheckedAt: '2026-10-11',
    regions: ['global'],
    aivoryIntegration: true,
    signals: ['spreadsheet', 'excel', 'sheets', 'email', 'form', 'formulir', 'shared drive', 'dokumen', 'document'],
    priority: 6,
    reason: {
      en: 'Sheets, Forms and shared Drive as a structured starting point for data capture — all connected to Aivory.',
      id: 'Sheets, Forms, dan Drive bersama sebagai titik awal pencatatan data yang terstruktur — semuanya terhubung ke Aivory.',
    },
    vendorUrl: 'https://workspace.google.com/pricing',
  },
  // Support & messaging
  {
    name: 'Zendesk',
    category: { en: 'Support ticketing', id: 'Tiket layanan pelanggan' },
    priceUSD: 69,
    priceBasis: 'per_user',
    priceCheckedAt: '2026-10-11',
    regions: ['global'],
    aivoryIntegration: true,
    minFTE: 6,
    signals: ['support', 'ticket', 'tiket', 'complaint', 'keluhan', 'customer service', 'layanan pelanggan', 'helpdesk', 'help desk', 'cs ticket'],
    priority: 8,
    reason: {
      en: 'Omnichannel ticketing with routing and SLAs — and Aivory\'s Ticket Ops agent works inside it.',
      id: 'Tiket omnichannel dengan routing dan SLA — dan agen Ticket Ops Aivory bekerja langsung di dalamnya.',
    },
    vendorUrl: 'https://www.zendesk.com/pricing/',
  },
  {
    name: 'Intercom',
    category: { en: 'Customer messaging', id: 'Pesan pelanggan' },
    priceUSD: 39,
    priceBasis: 'per_user',
    priceCheckedAt: '2026-10-11',
    regions: ['global'],
    aivoryIntegration: true,
    signals: ['live chat', 'website chat', 'chat pelanggan', 'in-app', 'customer question', 'pertanyaan pelanggan', 'faq'],
    priority: 6,
    reason: {
      en: 'Website and in-app chat with a shared inbox — answers repetitive customer questions, connected to Aivory.',
      id: 'Chat website dan in-app dengan inbox bersama — menjawab pertanyaan pelanggan yang berulang, terhubung ke Aivory.',
    },
    vendorUrl: 'https://www.intercom.com/pricing',
  },
  {
    name: 'Twilio (WhatsApp API)',
    category: { en: 'WhatsApp & SMS API', id: 'API WhatsApp & SMS' },
    priceUSD: 0,
    priceBasis: 'usage',
    priceNote: { en: '$0.005 per message + Meta\'s WhatsApp fee', id: '$0,005 per pesan + biaya WhatsApp dari Meta' },
    priceCheckedAt: '2026-10-11',
    regions: ['global'],
    aivoryIntegration: true,
    signals: ['whatsapp', 'sms', 'notification', 'notifikasi', 'reminder', 'pengingat', 'status update', 'update status', 'customer update'],
    priority: 7,
    reason: {
      en: 'Programmatic WhatsApp/SMS for status updates and reminders — Aivory sends them through Twilio automatically.',
      id: 'WhatsApp/SMS terprogram untuk update status dan pengingat — Aivory mengirimnya lewat Twilio secara otomatis.',
    },
    vendorUrl: 'https://www.twilio.com/en-us/whatsapp/pricing',
  },
  {
    name: 'Mailchimp',
    category: { en: 'Email marketing', id: 'Email marketing' },
    priceUSD: 13,
    priceBasis: 'flat',
    priceCheckedAt: '2026-10-11',
    regions: ['global'],
    aivoryIntegration: true,
    signals: ['newsletter', 'email marketing', 'campaign', 'kampanye', 'promo', 'marketing', 'pemasaran'],
    priority: 5,
    reason: {
      en: 'Email campaigns and automated follow-ups for leads and customers — connected to Aivory.',
      id: 'Kampanye email dan follow-up otomatis untuk prospek dan pelanggan — terhubung ke Aivory.',
    },
    vendorUrl: 'https://mailchimp.com/pricing/',
  },
  {
    name: 'Airtable',
    category: { en: 'Operational database', id: 'Database operasional' },
    priceUSD: 24,
    priceBasis: 'per_user',
    priceCheckedAt: '2026-10-11',
    regions: ['global'],
    aivoryIntegration: true,
    signals: ['tracker', 'tracking', 'database', 'basis data', 'list', 'daftar', 'status', 'spreadsheet', 'excel'],
    priority: 6,
    reason: {
      en: 'A structured database that still feels like a spreadsheet — the step up from Excel trackers, connected to Aivory.',
      id: 'Database terstruktur yang tetap terasa seperti spreadsheet — langkah naik dari tracker Excel, terhubung ke Aivory.',
    },
    vendorUrl: 'https://airtable.com/pricing',
  },
]

/**
 * Deterministic selector: match catalog signals against the diagnostic's own
 * words (pain points, opportunity titles, industry), respect region fit,
 * org-size gates, and budget, and return a de-duplicated top-N across
 * categories.
 */
export function selectSoftwareRecommendations(input: {
  currency: CurrencyCode
  industry?: string
  painPoints?: string[]
  opportunityTitles?: string[]
  budgetMidpointUSD?: number | null
  /** Team size in scope — gates mid/enterprise picks (SAP, Dynamics, Salesforce). */
  fteCountInScope?: number | null
  /** Market from the operating country (resolveMarket); falls back to the currency. */
  market?: Market | null
  max?: number
}): SoftwarePick[] {
  const max = input.max ?? 6
  const fte = input.fteCountInScope ?? null
  const haystackParts = [
    input.industry ?? '',
    ...(input.painPoints ?? []),
    ...(input.opportunityTitles ?? []),
  ]
  const haystack = haystackParts.join(' ').toLowerCase()

  const market = input.market === undefined ? resolveMarket(null, input.currency) : input.market
  const scored: Array<{ entry: CatalogEntry; signal: string; rank: number }> = []
  for (const entry of CATALOG) {
    // Org-size gate: SAP to a 5-person studio is noise, not a recommendation.
    if (entry.minFTE && (fte === null || fte < entry.minFTE)) continue
    // Market fit: local-only vendors (no 'global') surface only where they
    // operate, and get a +2 boost there so a local POS/payments/tax tool beats
    // a global one. Global vendors that also list a market are simply
    // available there — no boost, or they'd crowd out the most relevant picks.
    const listed = market !== null && (entry.regions as string[]).includes(market)
    const isGlobal = entry.regions.includes('global')
    if (!listed && !isGlobal) continue
    const signal = entry.signals.find((s) => signalMatches(haystack, s))
    if (signal) scored.push({ entry, signal, rank: entry.priority + (listed && !isGlobal ? 2 : 0) })
  }

  // Rank, then Aivory-connected first when equally relevant, then price;
  // one pick per category so the list covers distinct needs, not five CRMs.
  scored.sort((a, b) =>
    b.rank - a.rank ||
    Number(!!b.entry.aivoryIntegration) - Number(!!a.entry.aivoryIntegration) ||
    a.entry.priceUSD - b.entry.priceUSD)
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
 * Entry price rendered in the report's display currency, e.g. "~ Rp 300 rb/bln".
 * `rate` is the USD→local FX rate the report already uses for its ROI figures
 * (getRate() after ensureLiveRates()) — passing it in keeps this module pure
 * and the price consistent with every other number on the page.
 */
export function formatPickPrice(
  priceUSD: number,
  currency: CurrencyCode,
  rate: number,
  locale: 'en' | 'id',
  basis: SoftwareRecommendation['priceBasis'] = 'flat',
): string {
  if (priceUSD === 0) {
    if (basis === 'self_host') return locale === 'id' ? 'Gratis / self-host' : 'Free / self-host'
    return locale === 'id' ? 'Paket gratis tersedia' : 'Free plan available'
  }
  const label = formatCompactLocal(Math.round(priceUSD * rate), currency)
  // "~" not "≈": the PDF SDK section draws with base-14 Helvetica (WinAnsi),
  // which has no ≈ glyph — it rendered as garbage ("H). Tilde is safe everywhere.
  // The basis rides INSIDE the price string so it can never be separated from
  // the number by a layout change (see priceBasis on SoftwareRecommendation).
  const per = locale === 'id'
    ? { per_user: '/pengguna/bln', per_employee: '/karyawan/bln', flat: '/bln (paket tim)', self_host: '/bln', per_location: '/outlet/bln', transaction_fee: '', usage: '', quote: '' }
    : { per_user: '/user/mo', per_employee: '/employee/mo', flat: '/mo (team plan)', self_host: '/mo', per_location: '/outlet/mo', transaction_fee: '', usage: '', quote: '' }
  return `~ ${label}${per[basis]}`
}

/** Price line for any pick — the published note for fee/usage/quote bases. */
export function formatPick(
  pick: Pick<SoftwareRecommendation, 'priceUSD' | 'priceBasis' | 'priceNote'>,
  currency: CurrencyCode,
  rate: number,
  locale: 'en' | 'id',
): string {
  if (pick.priceBasis === 'transaction_fee' || pick.priceBasis === 'usage' || pick.priceBasis === 'quote') {
    if (pick.priceNote) return pick.priceNote[locale]
    return locale === 'id' ? 'Harga lewat sales' : 'Pricing on request'
  }
  return formatPickPrice(pick.priceUSD, currency, rate, locale, pick.priceBasis)
}

/** Label shown on picks Aivory connects to natively. */
export function aivoryIntegrationLabel(locale: 'en' | 'id'): string {
  return locale === 'id' ? 'Terhubung dengan Aivory' : 'Connects to Aivory'
}

/**
 * One place that turns a stored diagnostic context into selection inputs, so
 * the report page, the PDF and the blueprint can't drift (they used to pass
 * different budgets, and none passed the pain points — a string, not array).
 */
export function selectSoftwareForContext(
  ctx: {
    currency?: string
    qualitative?: { industry?: string; topPainPoints?: unknown; operatingCountry?: string }
    calculations?: { statedBudgetUSD?: number | null; assumedBudgetMidpointUSD?: number | null }
    quantitative?: { fteCountInScope?: number | null }
  },
  opportunityTitles: string[],
  currency: CurrencyCode,
): SoftwarePick[] {
  const raw = ctx.qualitative?.topPainPoints
  const painPoints = Array.isArray(raw)
    ? raw.map(String)
    : String(raw ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  return selectSoftwareRecommendations({
    currency,
    industry: ctx.qualitative?.industry,
    painPoints,
    opportunityTitles,
    budgetMidpointUSD: ctx.calculations?.statedBudgetUSD ?? ctx.calculations?.assumedBudgetMidpointUSD ?? null,
    fteCountInScope: ctx.quantitative?.fteCountInScope ?? null,
    market: resolveMarket(ctx.qualitative?.operatingCountry, currency),
  })
}

/** Read-only view of the catalog for hygiene tests (prices, competitors). */
export const CATALOG_FOR_TESTS: ReadonlyArray<SoftwareRecommendation> = CATALOG
