'use client'

/**
 * useDashboardAccess — Dashboard Entry Gate access resolver (nextjs-console)
 *
 * Resolves whether the current visitor may enter the operational dashboard at
 * `dashboard.aivory.id`. The hook returns a small state machine that starts at
 * `loading` (the SSR-safe default) and transitions MONOTONICALLY to EXACTLY ONE
 * terminal status — `allowed` or `denied` — after client hydration, issuing AT
 * MOST ONE redirect on denial.
 *
 * Decision order (design `resolveDashboardAccess` pseudocode):
 *   1. SSR (server render) → `loading`. No browser globals / AuthManager touched.            (Req 10.1)
 *   2. Super-admin URL code (`?superadmin=<SUPER_ADMIN_CODE>`) → `allowed`, taking
 *      precedence over the authentication and tier checks.                                   (Req 3.1)
 *   3. Not authenticated (and no super-admin code) → `denied` + redirect to the
 *      Marketing_Site sign-in.                                                               (Req 3.2)
 *   4. Authenticated super-admin account (superadmin/admin/employee) → `allowed`,
 *      bypassing the paid-tier check (per the Super_Admin glossary definition).
 *   5. Authenticated AND tier ∈ PAID_TIERS → `allowed`.                                      (Req 3.3)
 *   6. Authenticated but tier `free` / outside PAID_TIERS → `denied` + redirect to
 *      `/diagnostic?upgrade=1` on the Marketing_Site.                                        (Req 3.4)
 *   7. Tier lookup to `/api/v1/users/me` errors OR does not complete within 5s →
 *      treat the tier as `free`, `denied`, redirect to `/diagnostic?upgrade=1`, and
 *      record a warning-level diagnostic entry.                                              (Req 3.7)
 *
 * Postconditions: exactly one terminal state; at most one redirect (Req 3.5, 3.6);
 * timers/listeners cleaned up on unmount.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 10.1
 */

import { useEffect, useRef, useState } from 'react'
import { isServerRender, getWindow } from '@/lib/ssr-safe'
import { AuthManager } from '@/lib/authManager'
import { getMarketingUrl } from '@/lib/config'
import { PAID_TIERS, type PaidTier, isPaidTier } from '@/lib/tiers'

/**
 * Re-export the paid-tier rules from the single server-safe source of truth
 * (`lib/tiers.ts`). The constants and predicate previously lived here, but were
 * extracted so server route handlers can share them without importing this
 * `'use client'` module. They are re-exported so existing importers of
 * `PAID_TIERS` / `PaidTier` / `isPaidTier` from this hook keep working.
 */
export { PAID_TIERS, isPaidTier }
export type { PaidTier }

/* -------------------------------------------------------------------------- */
/* Public types                                                               */
/* -------------------------------------------------------------------------- */

export type DashboardAccessStatus = 'loading' | 'allowed' | 'denied'

export interface DashboardAccess {
  /** Lifecycle status of the gate. SSR/initial value is always `loading`. */
  status: DashboardAccessStatus
  /** Resolved user tier (lowercased). Defaults to `free` when unknown. */
  tier: string
  /** True when access was granted via the super-admin bypass (URL code or account). */
  isSuperAdmin: boolean
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Super-admin URL bypass.
 *
 * The legacy stack enables super-admin mode via the `?superadmin=<code>` query
 * parameter (see `frontend/id-chain-manager.js` `isSuperAdminMode()` and
 * `frontend/dashboard.js`). The shared code is `GrandMasterRCH`. Presence of
 * this exact code grants access regardless of authentication or tier (Req 3.1).
 */
export const SUPER_ADMIN_PARAM = 'superadmin'
export const SUPER_ADMIN_CODE = 'GrandMasterRCH'

/** Tier-lookup endpoint (Req 3.7). Path is fixed by the spec. */
const TIER_LOOKUP_PATH = '/api/v1/users/me'

/** Tier lookup must resolve within 5 seconds, else the tier is treated as `free` (Req 3.5, 3.7). */
export const TIER_LOOKUP_TIMEOUT_MS = 5000

/* -------------------------------------------------------------------------- */
/* Pure decision helpers (testable without the browser / network)            */
/* -------------------------------------------------------------------------- */

/** Where a denial should send the user. `null` for an `allowed` outcome. */
export type RedirectTarget = 'sign-in' | 'upgrade' | null

export interface AccessDecisionInput {
  /** Whether the valid super-admin URL code is present. */
  hasSuperAdminCode: boolean
  /** Whether the visitor has a valid shared session. */
  isAuthenticated: boolean
  /** Whether the authenticated account is a super-admin (superadmin/admin/employee). */
  isSuperAdminAccount: boolean
  /** Resolved tier from the lookup, or `null`/`free` when unknown/failed. */
  tier: string | null
}

export interface AccessDecision {
  status: DashboardAccessStatus
  tier: string
  isSuperAdmin: boolean
  redirect: RedirectTarget
}

/**
 * Pure, synchronous access decision given fully-resolved inputs. The hook drives
 * the async tier lookup and feeds the result here. Keeping the branching pure
 * makes the gate's logic deterministic and independently testable.
 *
 * `ALLOWED` iff the super-admin URL code is present, the account is a super-admin,
 * or authenticated (all tiers, including free); everything else is `DENIED` with a redirect.
 */
export function resolveDashboardDecision(input: AccessDecisionInput): AccessDecision {
  // 1. Super-admin URL code wins over auth + tier (Req 3.1).
  if (input.hasSuperAdminCode) {
    return { status: 'allowed', tier: 'superadmin', isSuperAdmin: true, redirect: null }
  }

  // 2. Unauthenticated → back to the marketing sign-in (Req 3.2).
  if (!input.isAuthenticated) {
    return { status: 'denied', tier: 'free', isSuperAdmin: false, redirect: 'sign-in' }
  }

  // 3. Authenticated super-admin account bypasses the paid-tier check
  //    (Super_Admin glossary definition; legacy `auth-guard.js` parity).
  if (input.isSuperAdminAccount) {
    return { status: 'allowed', tier: 'superadmin', isSuperAdmin: true, redirect: null }
  }

  // 4. All authenticated users (free, snapshot, blueprint, enterprise) → allowed
  //    Dashboard is now accessible to all non-admin authenticated users.
  const tier = (input.tier ?? 'free').toLowerCase()
  return { status: 'allowed', tier, isSuperAdmin: false, redirect: null }
}

/* -------------------------------------------------------------------------- */
/* Tier lookup (with bounded timeout)                                         */
/* -------------------------------------------------------------------------- */

function getTierLookupUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8081'
  return `${base}${TIER_LOOKUP_PATH}`
}

interface TierLookupOutcome {
  /** Lowercased tier, or `free` when the lookup failed/timed out. */
  tier: string
  /** True when the request errored, returned a non-OK status, or timed out (Req 3.7). */
  failed: boolean
}

/**
 * Fetches the current user's tier from `/api/v1/users/me`, bounded to
 * {@link TIER_LOOKUP_TIMEOUT_MS}. On any error, non-OK response, or timeout the
 * tier is reported as `free` with `failed=true` (Req 3.7). Aborts when the
 * caller's `parentSignal` fires (unmount), so no work outlives the component.
 */
async function lookupTier(
  token: string | null,
  parentSignal: AbortSignal,
): Promise<TierLookupOutcome> {
  const controller = new AbortController()
  const onParentAbort = () => controller.abort()
  if (parentSignal.aborted) controller.abort()
  parentSignal.addEventListener('abort', onParentAbort)

  const timeoutId = setTimeout(() => controller.abort(), TIER_LOOKUP_TIMEOUT_MS)

  try {
    const res = await fetch(getTierLookupUrl(), {
      method: 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!res.ok) {
      return { tier: 'free', failed: true }
    }

    const data = (await res.json().catch(() => null)) as { tier?: unknown } | null
    const tier = data && typeof data.tier === 'string' ? data.tier.toLowerCase() : 'free'
    return { tier, failed: false }
  } catch {
    // Network error, abort (timeout or unmount) → treat as free + failed.
    return { tier: 'free', failed: true }
  } finally {
    clearTimeout(timeoutId)
    parentSignal.removeEventListener('abort', onParentAbort)
  }
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                       */
/* -------------------------------------------------------------------------- */

const LOADING_STATE: DashboardAccess = {
  status: 'loading',
  tier: 'free',
  isSuperAdmin: false,
}

/**
 * Resolves dashboard access for the current visitor. Returns `loading` during
 * SSR and the initial client render, then resolves to a single terminal status
 * after hydration, redirecting away on denial.
 */
export function useDashboardAccess(): DashboardAccess {
  // SSR-safe initial value: always `loading` before hydration (Req 10.1).
  const [access, setAccess] = useState<DashboardAccess>(LOADING_STATE)

  // Guarantees a single terminal transition + at most one redirect (Req 3.5, 3.6).
  const resolvedRef = useRef(false)

  useEffect(() => {
    // Never run resolution during SSR (defensive — effects are client-only).
    if (isServerRender()) return

    const win = getWindow()
    if (!win) return

    let cancelled = false
    const abortController = new AbortController()

    const redirect = (target: Exclude<RedirectTarget, null>) => {
      const marketing = getMarketingUrl()
      const url =
        target === 'sign-in' ? `${marketing}/login` : `${marketing}/diagnostic?upgrade=1`
      win.location.href = url
    }

    const finalize = (next: DashboardAccess, target: RedirectTarget) => {
      // Monotonic: only the first resolution sticks; redirect fires at most once.
      if (cancelled || resolvedRef.current) return
      resolvedRef.current = true
      if (target) redirect(target)
      setAccess(next)
    }

    const run = async () => {
      const hasSuperAdminCode =
        new URLSearchParams(win.location.search).get(SUPER_ADMIN_PARAM) === SUPER_ADMIN_CODE
      const authenticated = AuthManager.isAuthenticated()
      const superAdminAccount = authenticated && AuthManager.isSuperAdmin()

      // Decision: URL code / unauth / super-admin / or authenticated user (any tier)
      // No tier lookup needed since all authenticated users are allowed
      const decision = resolveDashboardDecision({
        hasSuperAdminCode,
        isAuthenticated: authenticated,
        isSuperAdminAccount: superAdminAccount,
        tier: null, // Tier not needed for decision anymore
      })
      finalize(
        { status: decision.status, tier: decision.tier, isSuperAdmin: decision.isSuperAdmin },
        decision.redirect,
      )
    }

    void run()

    return () => {
      // Clean up timers/listeners and abort any in-flight lookup on unmount.
      cancelled = true
      abortController.abort()
    }
  }, [])

  return access
}

export default useDashboardAccess
