import { describe, it, expect } from 'vitest'
import {
  selectSoftwareRecommendations,
  selectSoftwareForContext,
  resolveMarket,
  formatPick,
  CATALOG_FOR_TESTS,
} from './softwareCatalog'

const MAX_PRICE_AGE_DAYS = 183

describe('catalog hygiene', () => {
  it('every price was checked within the last 6 months', () => {
    const now = Date.now()
    const stale = CATALOG_FOR_TESTS
      .filter((e) => (now - new Date(e.priceCheckedAt).getTime()) / 86_400_000 > MAX_PRICE_AGE_DAYS)
      .map((e) => `${e.name} (checked ${e.priceCheckedAt})`)
    // When this fails: re-check those vendors' pricing pages, update priceUSD
    // / priceNote and priceCheckedAt. Stale prices go to clients in the PDF.
    expect(stale).toEqual([])
  })

  it('never recommends a workflow-automation platform (Aivory is one)', () => {
    const names = CATALOG_FOR_TESTS.map((e) => e.name.toLowerCase())
    for (const competitor of ['make', 'n8n', 'zapier', 'power automate', 'ifttt']) {
      expect(names.some((n) => n === competitor || n.startsWith(`${competitor} `))).toBe(false)
    }
    expect(CATALOG_FOR_TESTS.some((e) => /workflow automation/i.test(e.category.en))).toBe(false)
  })

  it('fee/usage/quote entries carry the published rate note; others a real price', () => {
    for (const e of CATALOG_FOR_TESTS) {
      if (e.priceBasis === 'transaction_fee' || e.priceBasis === 'usage') expect(e.priceNote, e.name).toBeTruthy()
      expect(e.priceUSD, e.name).toBeGreaterThanOrEqual(0)
      expect(e.vendorUrl.startsWith('https://'), e.name).toBe(true)
    }
  })
})

describe('resolveMarket', () => {
  it('uses the operating country first, the currency as fallback', () => {
    expect(resolveMarket('Saudi Arabia', 'USD')).toBe('sa')
    expect(resolveMarket(undefined, 'IDR')).toBe('id')
    expect(resolveMarket('Other', 'IDR')).toBe('id')
    expect(resolveMarket('United Kingdom', 'IDR')).toBe('gb')
  })
})

const pick = (market: Parameters<typeof resolveMarket>[0], currency: 'IDR' | 'SAR' | 'USD', pains: string[], fte = 33) =>
  selectSoftwareRecommendations({ currency, painPoints: pains, fteCountInScope: fte, market: resolveMarket(market, currency) }).map((p) => p.name)

describe('market-aware selection', () => {
  const pains = ['Daily sales recap from each outlet is done by hand at the cashier', 'Chasing payment from customers and reconciliation of invoices']
  it('Indonesia → Moka POS + Xendit', () => {
    const names = pick('Indonesia', 'IDR', pains)
    expect(names).toContain('Moka POS')
    expect(names).toContain('Xendit')
    expect(names).not.toContain('Foodics')
    expect(names).not.toContain('Stripe')
  })
  it('Saudi Arabia → Foodics + Tap Payments + Qoyod', () => {
    const names = pick('Saudi Arabia', 'SAR', [...pains, 'Accounting and VAT filing in Excel'])
    expect(names).toContain('Foodics')
    expect(names).toContain('Tap Payments')
    expect(names).toContain('Qoyod')
    expect(names).not.toContain('Moka POS')
  })
  it('United States → Square POS + Stripe', () => {
    const names = pick('United States', 'USD', pains)
    expect(names).toContain('Square POS')
    expect(names).toContain('Stripe')
  })
  it('logistics pains surface OCR and delivery tools (the screenshot case)', () => {
    const names = pick('Indonesia', 'IDR', [
      'Dispatchers re-key orders from email and WhatsApp into the TMS by hand',
      'Shipment status updates to customers are chased manually',
      'Invoice and proof-of-delivery reconciliation causes billing delays',
    ])
    expect(names).toContain('Google Document AI')
    expect(names).toContain('Onfleet')
  })
})

describe('selectSoftwareForContext', () => {
  it('splits the stored pain-point textarea and reads the operating country', () => {
    const names = selectSoftwareForContext(
      { qualitative: { topPainPoints: 'Stock runs out without anyone noticing\nOutlet cashier recap by hand', operatingCountry: 'Indonesia' }, quantitative: { fteCountInScope: 10 } },
      [],
      'IDR',
    ).map((p) => p.name)
    expect(names).toContain('Moka POS')
    expect(names.some((n) => n === 'Zoho Inventory' || n === 'Odoo')).toBe(true)
  })
})

describe('formatPick', () => {
  it('shows the published note for fee, usage and quote bases', () => {
    const xendit = CATALOG_FOR_TESTS.find((e) => e.name === 'Xendit')!
    expect(formatPick(xendit, 'IDR', 16_000, 'id')).toContain('QRIS')
    expect(formatPick({ priceUSD: 0, priceBasis: 'quote' }, 'SAR', 3.75, 'en')).toBe('Pricing on request')
    expect(formatPick({ priceUSD: 18, priceBasis: 'per_location' }, 'IDR', 16_600, 'id')).toMatch(/\/outlet\/bln$/)
  })
})
