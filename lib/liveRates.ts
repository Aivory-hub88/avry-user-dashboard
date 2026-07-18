/**
 * Live FX rates for ROI display/calculation.
 *
 * Fetches /api/exchange-rates (multi-source, server-cached 2h) and caches the
 * result in localStorage with a 2-hour TTL. Every consumer goes through
 * getRate(), which falls back to the static CURRENCY_RATES snapshot when no
 * live quote is available (SSR, fetch failure, all sources stale), so ROI
 * math never breaks.
 *
 * Call ensureLiveRates() (and await it) before computing or rendering ROI
 * figures — getRate() itself is synchronous.
 */
import { CURRENCY_RATES, FX_AS_OF } from '@/lib/currencyConfig'
import { asset } from '@/lib/asset'

const STORAGE_KEY = 'aivory_fx_rates_v1'
const TTL_MS = 2 * 60 * 60 * 1000 // refresh every 2 hours

interface CachedRates {
  rates: Record<string, number>
  live: boolean
  lastUpdatedUnix: number | null
  fetchedAt: number
}

let cache: CachedRates | null = null
let inflight: Promise<void> | null = null

function readStorage(): CachedRates | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedRates
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.rates?.IDR !== 'number' || typeof parsed.fetchedAt !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export async function ensureLiveRates(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!cache) cache = readStorage()
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const res = await fetch(asset('/api/exchange-rates'), {
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return
      const data = await res.json()
      if (!data?.rates || typeof data.rates.IDR !== 'number') return
      cache = {
        rates: data.rates,
        live: !!data.live,
        lastUpdatedUnix: data.metadata?.lastUpdatedUnix ?? null,
        fetchedAt: Date.now(),
      }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)) } catch { /* quota */ }
    } catch {
      // Network failure — keep whatever cache we have; getRate() falls back
      // to the static snapshot.
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** USD→currency rate: live quote if available, static snapshot otherwise. */
export function getRate(currencyCode: string): number {
  if (!cache) cache = readStorage()
  const live = cache?.rates?.[currencyCode]
  if (typeof live === 'number' && live > 0) return live
  return CURRENCY_RATES[currencyCode] ?? 1
}

/** Human label for "FX rates as of …" footnotes. */
export function getFxAsOfLabel(): string {
  if (!cache) cache = readStorage()
  if (cache?.live && cache.lastUpdatedUnix) {
    return new Date(cache.lastUpdatedUnix * 1000).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    }) + ' (live)'
  }
  return FX_AS_OF
}

/** True when the current rates came from a live source (not the snapshot). */
export function isLiveRates(): boolean {
  if (!cache) cache = readStorage()
  return !!cache?.live
}
