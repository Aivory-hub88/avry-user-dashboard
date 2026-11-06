import { describe, it, expect } from 'vitest'
import { buildWebsiteInsightsView } from './websiteInsightsView'

const PROFILE = {
  industry: 'food_beverage', business_model: 'b2c', products: ['Kopi arabika', 'Mesin espresso'],
  tech_signals: ['mobile_app', 'online_booking', 'bogus'], size_signal: 'small', language: 'id',
}

describe('buildWebsiteInsightsView', () => {
  it('is null when no website was involved', () => {
    expect(buildWebsiteInsightsView(null, 'en')).toBeNull()
    expect(buildWebsiteInsightsView({ score: 50 }, 'en')).toBeNull()
  })

  it('builds localized facts and insights when the profile was found', () => {
    const v = buildWebsiteInsightsView({ web_context: 'ok', web_profile: PROFILE, website_insights: ['A', ' ', 'B', 'C', 'D'] }, 'id')!
    expect(v.state).toBe('found')
    expect(v.facts.map(f => f.label)).toEqual(['Industri', 'Model bisnis', 'Penawaran', 'Sinyal digital'])
    expect(v.facts[0].value).toBe('Makanan & minuman')
    expect(v.facts[3].value).toBe('Aplikasi mobile · Pemesanan online') // unknown signal dropped
    expect(v.insights).toEqual(['A', 'B', 'C'])
    expect(v.note).toMatch(/Tidak mengubah skor/)
  })

  it('English labels', () => {
    const v = buildWebsiteInsightsView({ web_context: 'partial', web_profile: PROFILE }, 'en')!
    expect(v.state).toBe('partial')
    expect(v.facts[0]).toEqual({ label: 'Industry', value: 'Food & beverage' })
  })

  it('unavailable and social_only never claim to have read anything', () => {
    const u = buildWebsiteInsightsView({ web_context: 'unavailable' }, 'en')!
    expect(u.state).toBe('unavailable'); expect(u.facts).toEqual([]); expect(u.note).toMatch(/could not read/)
    const s = buildWebsiteInsightsView({ web_context: 'social_only' }, 'id')!
    expect(s.state).toBe('social_only'); expect(s.insights).toEqual([])
    // 'ok' but profile missing/garbled degrades to unavailable
    expect(buildWebsiteInsightsView({ web_context: 'ok' }, 'en')!.state).toBe('unavailable')
  })
})
