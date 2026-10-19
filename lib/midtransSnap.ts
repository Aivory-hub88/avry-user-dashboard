'use client'

/**
 * Load Midtrans Snap for the environment the payments service actually runs in.
 *
 * Every loader in the dashboard used to hardcode the *sandbox* script
 * (app.sandbox.midtrans.com) with NEXT_PUBLIC_MIDTRANS_CLIENT_KEY, which is not
 * set in the production build. Production tokens cannot open in sandbox Snap,
 * so plan, feature, credit and wallet purchases from the dashboard could not
 * be paid at all. The payments service publishes the right client key and
 * script URL at GET /api/v1/payments/client-key (no auth: the client key is
 * public by design), so this reads them from there.
 */

import { SERVICES } from '@/config/services'

interface SnapConfig {
  clientKey: string
  scriptUrl: string
}

const SANDBOX_SNAP = 'https://app.sandbox.midtrans.com/snap/snap.js'
const SCRIPT_ID = 'midtrans-snap-js'

let loading: Promise<boolean> | null = null

async function fetchSnapConfig(): Promise<SnapConfig | null> {
  try {
    const res = await fetch(`${SERVICES.PAYMENTS}/api/v1/payments/client-key`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.success || typeof data.client_key !== 'string' || !data.client_key) return null
    const scriptUrl =
      typeof data.snap_js_url === 'string' && data.snap_js_url
        ? data.snap_js_url
        : data.is_production
          ? 'https://app.midtrans.com/snap/snap.js'
          : SANDBOX_SNAP
    return { clientKey: data.client_key, scriptUrl }
  } catch {
    return null
  }
}

/** Resolve true once `window.snap` is usable, false if it could not load. */
export function loadSnap(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if ((window as unknown as { snap?: unknown }).snap) return Promise.resolve(true)
  if (loading) return loading

  loading = (async () => {
    const config = await fetchSnapConfig()
    if (!config) return false
    return new Promise<boolean>((resolve) => {
      const script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = config.scriptUrl
      script.setAttribute('data-client-key', config.clientKey)
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  })()

  // A failed attempt must not be cached, or a retry could never succeed.
  loading.then((ok) => {
    if (!ok) loading = null
  })
  return loading
}
