import { NextResponse } from 'next/server'
import { CURRENCY_RATES, FX_AS_OF } from '@/lib/currencyConfig'

// Mirrors the landing page's /api/exchange-rate route (multi-source fallback +
// staleness validation), extended from USD→IDR only to every display currency
// the diagnostic supports, and cached for 2 hours instead of 1.
export const revalidate = 7200 // 2 hours

const SUPPORTED = Object.keys(CURRENCY_RATES)

interface RatesSource {
  url: string
  parse: (data: any) => Record<string, unknown> | undefined
  parseTime: (data: any) => number | undefined
}

async function fetchWithFallbacks() {
  const sources: RatesSource[] = [
    {
      // FxRatesAPI provides hourly updates for free
      url: 'https://api.fxratesapi.com/latest',
      parse: (data) => data.rates,
      parseTime: (data) => data.timestamp,
    },
    {
      url: 'https://api.exchangerate-api.com/v4/latest/USD',
      parse: (data) => data.rates,
      parseTime: (data) => data.time_last_updated,
    },
    {
      url: 'https://open.er-api.com/v6/latest/USD',
      parse: (data) => data.rates,
      parseTime: (data) => data.time_last_update_unix,
    },
  ]

  const nowUnix = Math.floor(Date.now() / 1000)
  const MAX_AGE_SECONDS = 4 * 60 * 60 // reject quotes older than 4 hours

  for (const source of sources) {
    try {
      const res = await fetch(source.url, {
        next: { revalidate: 7200 },
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) continue

      const data = await res.json()
      const all = source.parse(data)
      const lastUpdated = source.parseTime(data)

      if (!all || typeof all !== 'object') continue
      if (lastUpdated && nowUnix - lastUpdated > MAX_AGE_SECONDS) {
        console.warn(`[ExchangeRates] Source ${source.url} returned stale data. Skipping.`)
        continue
      }

      const rates: Record<string, number> = { USD: 1 }
      for (const code of SUPPORTED) {
        const r = all[code]
        if (typeof r === 'number' && r > 0) rates[code] = r
      }
      // IDR is the primary market — a source that can't quote it is unusable.
      if (typeof rates.IDR !== 'number') continue

      return { rates, lastUpdatedUnix: lastUpdated || nowUnix, source: source.url }
    } catch (e) {
      console.warn(`[ExchangeRates] Failed to fetch from ${source.url}`, e)
      continue
    }
  }
  return null
}

export async function GET() {
  const result = await fetchWithFallbacks()

  if (result) {
    return NextResponse.json({
      rates: result.rates,
      live: true,
      metadata: {
        source: result.source,
        lastUpdatedUnix: result.lastUpdatedUnix,
        systemCheckedAt: new Date().toISOString(),
      },
    })
  }

  // Every source failed or was stale — serve the static snapshot so the
  // diagnostic's ROI math keeps working instead of erroring out.
  return NextResponse.json({
    rates: CURRENCY_RATES,
    live: false,
    metadata: {
      source: `static snapshot ${FX_AS_OF}`,
      lastUpdatedUnix: null,
      systemCheckedAt: new Date().toISOString(),
    },
  })
}
