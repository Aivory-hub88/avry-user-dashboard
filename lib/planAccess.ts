'use client'

/**
 * The signed-in account's plan, as the BROWSER knows it — for showing locks
 * and upgrade prompts only. The server decides access on every request
 * (lib/planGate.ts), so this being wrong or edited can only change what is
 * drawn, never what is allowed.
 *
 * Read once per page load from avry-backend `GET /api/v1/entitlements/access`
 * (falls back to `/auth/me` on an older backend) and shared by every caller.
 */

import { authedFetch } from '@/lib/deployAuth'

export interface PlanAccess {
  /** `loading` until the first answer; `error` when it couldn't be read. */
  status: 'loading' | 'ready' | 'error'
  /** null while unknown: never lock the UI on a guess. */
  paid: boolean | null
  tier: string | null
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'
const STAFF = new Set(['superadmin', 'admin', 'employee', 'demo'])
const PAID_TIERS = new Set(['snapshot', 'blueprint', 'operational', 'business', 'enterprise', 'foundation', 'pro'])

let state: PlanAccess = { status: 'loading', paid: null, tier: null }
let inflight: Promise<void> | null = null
const listeners = new Set<(s: PlanAccess) => void>()

function set(next: PlanAccess) {
  state = next
  listeners.forEach((l) => l(state))
}

async function load(): Promise<void> {
  try {
    let res = await authedFetch(`${BACKEND}/api/v1/entitlements/access`)
    if (res.status === 404) res = await authedFetch(`${BACKEND}/api/v1/auth/me`)
    if (!res.ok) throw new Error(`plan ${res.status}`)
    const data = (await res.json()) as { tier?: unknown; paid?: unknown; account_type?: unknown }
    const tier = typeof data.tier === 'string' ? data.tier.toLowerCase() : 'free'
    const accountType = typeof data.account_type === 'string' ? data.account_type.toLowerCase() : ''
    const paid = typeof data.paid === 'boolean' ? data.paid : PAID_TIERS.has(tier) || STAFF.has(accountType)
    set({ status: 'ready', paid, tier })
  } catch {
    set({ status: 'error', paid: null, tier: null })
  }
}

/** Current snapshot; starts the one load on first use. */
export function getPlanAccess(): PlanAccess {
  if (typeof window !== 'undefined' && !inflight) inflight = load()
  return state
}

export function subscribePlanAccess(fn: (s: PlanAccess) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Re-read after a purchase or sign-in. */
export function refreshPlanAccess(): Promise<void> {
  inflight = load()
  return inflight
}

/* ---- Upgrade prompt (works from non-React code: streams, API clients) ---- */

export const UPGRADE_EVENT = 'aivory:upgrade-required'

export interface UpgradeRequest {
  /** What the person tried to use, e.g. "AI Console". */
  feature?: string
  /** Server message to show instead of the default copy. */
  message?: string
}

export function requestUpgrade(detail: UpgradeRequest = {}): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<UpgradeRequest>(UPGRADE_EVENT, { detail }))
}

/**
 * If `body` is a server 402 UPGRADE_REQUIRED answer, open the upgrade prompt
 * and return true. Lets API clients hand off without knowing about React.
 */
export function handleUpgradeRequired(status: number, body: unknown, feature?: string): boolean {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (status !== 402 || b.code !== 'UPGRADE_REQUIRED') return false
  const message = typeof b.message === 'string' ? b.message : typeof b.error === 'string' ? b.error : undefined
  requestUpgrade({ feature, message })
  return true
}
