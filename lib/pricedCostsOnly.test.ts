import { describe, it, expect, beforeEach } from 'vitest'
import { buildDiagnosticContext } from '@/services/deepDiagnostic'
import { unpricedCount, pricedOnlyTag, pricedOnlyNote } from './pricedCostsOnly'

beforeEach(() => {
  ;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})

describe('priced costs only', () => {
  it('counts the items the report could not price', () => {
    expect(unpricedCount({ requiredInvestment: { unpriced: [{}, {}, {}] } })).toBe(3)
    expect(unpricedCount({ requiredInvestment: { unpriced: [] } })).toBe(0)
    expect(unpricedCount({ requiredInvestment: {} })).toBe(0)
    expect(unpricedCount(null)).toBe(0)
  })

  it('says nothing when everything is priced', () => {
    expect(pricedOnlyTag(0, 'en')).toBe('')
    expect(pricedOnlyNote(0, 'en')).toBeNull()
  })

  it('tags the tile and explains that the real ROI is lower (en + id, singular and plural)', () => {
    expect(pricedOnlyTag(2, 'en')).toBe(' · priced costs only')
    expect(pricedOnlyTag(2, 'id')).toBe(' · hanya biaya yang diberi harga')
    expect(pricedOnlyNote(1, 'en')).toMatch(/^ROI and payback use only the costs that could be priced\. 1 item .* is not priced, so the real ROI is lower\./)
    expect(pricedOnlyNote(6, 'en')).toMatch(/6 items .* are not priced/)
    expect(pricedOnlyNote(6, 'id')).toMatch(/^ROI dan payback dihitung hanya dari biaya yang bisa diberi harga\. 6 item .* belum diberi harga, jadi ROI yang sebenarnya lebih rendah/)
  })

  it('a real report whose ROI looks very high is exactly the case that has unpriced items', () => {
    const ctx: any = buildDiagnosticContext({
      currency: 'IDR — Indonesian Rupiah (Rp)', industry: 'Technology / Software', hourly_cost: 75000,
      manual_hours_weekly: 'Under 10 hours/week', fte_count: '6-15 FTEs',
      automation_current: '10-25%', target_automation: '50-75%', operating_country: 'Indonesia',
      pain_points: 'sales outreach is manual; lead follow up in whatsapp; invoices',
      priority_areas: ['Operations and logistics', 'Customer service/support'],
    } as any)
    expect(unpricedCount(ctx.calculations)).toBeGreaterThan(0)
    expect(pricedOnlyNote(unpricedCount(ctx.calculations), 'en')).not.toBeNull()
  })
})
