/**
 * Server-side paid-plan gate for the dashboard's API routes.
 *
 * The dashboard entry gate (`hooks/useDashboardAccess.ts`) only redirects in
 * the browser, so anything that costs money must be decided here, on the
 * server, from facts the browser cannot edit:
 *   - identity from the verified HS256 JWT (`lib/serverAuth.ts`), never from
 *     the `aivory_user` cookie or localStorage;
 *   - the tier from avry-backend `GET /api/v1/entitlements/access`, read
 *     fresh from `identity.user_tiers` and answering 503 (not "free") when it
 *     can't (falls back to `/auth/me` while that endpoint isn't deployed);
 *   - team grants from `dashboard.workspace_members`, honoured only when the
 *     team's owner holds a live subscription (or is staff), so an account with
 *     no plan cannot unlock itself by creating its own team.
 *
 * The gate fails CLOSED: when the tier or the team lookup is unavailable the
 * request gets a 503, never a free pass.
 *
 * SERVER-ONLY.
 */
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUserWithToken, type AuthUser } from '@/lib/serverAuth'
import { isPaidTier, isSuperAdminAccount, toSubscriptionTier } from '@/lib/tiers'
import { memberCanUse } from '@/lib/workspaceModules'
import { LEGACY_WORKSPACE } from '@/lib/teams'

/** The plan an account without one is asked to upgrade to. */
export const UPGRADE_TIER = 'operational'

/**
 * For features that belong to no single module (the in-page Aivory assistant,
 * intent routing): any seat on a paying team is enough.
 */
export const ANY_MODULE = '*'

/** Staff and demo accounts bypass the plan gate (verified JWT claim only). */
export function isPlanExempt(accountType: string | null | undefined): boolean {
  return isSuperAdminAccount(accountType) || accountType === 'demo'
}

export interface TeamGrant {
  role: string
  modules: string[] | null
  /** The workspace owner's live tier (null when none). */
  ownerTier: string | null
  ownerAccountType: string | null
}

export type PlanDecision =
  | { ok: true; via: 'staff' | 'plan' | 'team' }
  | { ok: false; status: 402 | 403; code: 'UPGRADE_REQUIRED' | 'MODULE_DISABLED' }

/** A team seat only counts when the owner pays for it (or is staff). */
export function ownerCoversSeat(g: TeamGrant): boolean {
  return isPlanExempt(g.ownerAccountType) || toSubscriptionTier(g.ownerTier) !== null
}

/**
 * Pure decision. Own paid plan → allowed, never team-restricted. No plan →
 * only the modules granted by a paying team owner; no paying team at all →
 * upgrade required.
 */
export function decidePlanAccess(input: {
  accountType: string | null | undefined
  tier: string | null | undefined
  /** The backend's own verdict (staff/demo per the database, or any plan). */
  paid?: boolean
  grants: TeamGrant[]
  module: string
}): PlanDecision {
  if (isPlanExempt(input.accountType)) return { ok: true, via: 'staff' }
  if (input.paid || isPaidTier(input.tier)) return { ok: true, via: 'plan' }
  const covered = input.grants.filter(ownerCoversSeat)
  if (covered.length === 0) return { ok: false, status: 402, code: 'UPGRADE_REQUIRED' }
  if (input.module === ANY_MODULE) return { ok: true, via: 'team' }
  if (covered.some((g) => memberCanUse(g.role, g.modules, input.module))) return { ok: true, via: 'team' }
  return { ok: false, status: 403, code: 'MODULE_DISABLED' }
}

/* ---- I/O ---- */

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'
const TIER_TIMEOUT_MS = 5000
/** Short, so a fresh payment unlocks within seconds without a re-login. */
const TIER_CACHE_MS = 20_000
const TIER_CACHE_MAX = 2000

type TierLookup = { kind: 'ok'; tier: string; paid: boolean } | { kind: 'unauthorized' } | { kind: 'unavailable' }

const tierCache = new Map<string, { tier: string; paid: boolean; at: number }>()

/** Test hook. */
export function clearPlanCache(): void {
  tierCache.clear()
}

async function lookupTier(userId: string, token: string): Promise<TierLookup> {
  const hit = tierCache.get(userId)
  if (hit && Date.now() - hit.at < TIER_CACHE_MS) return { kind: 'ok', tier: hit.tier, paid: hit.paid }

  const get = (path: string) =>
    fetch(`${BACKEND}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIER_TIMEOUT_MS),
    })
  try {
    let res = await get('/api/v1/entitlements/access')
    // Older backend without the strict endpoint: /auth/me (best-effort tier).
    if (res.status === 404) res = await get('/api/v1/auth/me')
    if (res.status === 401 || res.status === 403) return { kind: 'unauthorized' }
    if (!res.ok) return { kind: 'unavailable' }
    const data = (await res.json().catch(() => null)) as { tier?: unknown; paid?: unknown } | null
    if (!data || typeof data.tier !== 'string') return { kind: 'unavailable' }
    const tier = data.tier.toLowerCase()
    const paid = data.paid === true
    if (tierCache.size >= TIER_CACHE_MAX) tierCache.clear()
    tierCache.set(userId, { tier, paid, at: Date.now() })
    return { kind: 'ok', tier, paid }
  } catch {
    return { kind: 'unavailable' }
  }
}

async function teamGrants(userId: string): Promise<TeamGrant[]> {
  const r = await query(
    `SELECT m.role, m.modules, t.tier AS owner_tier, u.account_type AS owner_account_type
       FROM dashboard.workspace_members m
       JOIN dashboard.workspaces w ON w.id = m.workspace_id
       LEFT JOIN identity.users u ON u.id = w.owner
       LEFT JOIN identity.user_tiers t
         ON t.user_id = w.owner AND (t.expires_at IS NULL OR t.expires_at > now())
      WHERE m.user_id = $1 AND m.workspace_id <> $2 AND w.owner <> $1`,
    [userId, LEGACY_WORKSPACE],
  )
  return r.rows.map((row) => ({
    role: String(row.role),
    modules: (row.modules as string[] | null) ?? null,
    ownerTier: (row.owner_tier as string | null) ?? null,
    ownerAccountType: (row.owner_account_type as string | null) ?? null,
  }))
}

/** Routes and clients here read either `error` or `message`; send both. */
function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json({ ...body, message: body.error }, { status })
}

const UNAUTHENTICATED = () =>
  json(401, { error: 'Please sign in again to continue.', code: 'UNAUTHENTICATED' })
const UNAVAILABLE = () =>
  json(503, { error: 'We could not check your plan right now. Please try again in a moment.', code: 'PLAN_CHECK_UNAVAILABLE' })

export type PlanGate =
  | { ok: true; user: AuthUser; token: string }
  | { ok: false; response: NextResponse; code: PlanDenyCode }

export type PlanDenyCode = 'UNAUTHENTICATED' | 'UPGRADE_REQUIRED' | 'MODULE_DISABLED' | 'PLAN_CHECK_UNAVAILABLE'

/**
 * Gate a paid module. Returns the verified caller, or the response to send:
 *   401 UNAUTHENTICATED     — no valid access token
 *   402 UPGRADE_REQUIRED    — signed in, no paid plan, no paying team
 *   403 MODULE_DISABLED     — team member whose admin didn't grant `module`
 *   503 PLAN_CHECK_UNAVAILABLE — lookup failed (fail closed)
 */
export async function requirePaidPlan(req: NextRequest, module: string): Promise<PlanGate> {
  let auth: ReturnType<typeof getAuthUserWithToken>
  try {
    auth = getAuthUserWithToken(req)
  } catch (e) {
    console.error('[planGate] token verification unavailable:', e)
    return { ok: false, response: UNAVAILABLE(), code: 'PLAN_CHECK_UNAVAILABLE' }
  }
  if (!auth) return { ok: false, response: UNAUTHENTICATED(), code: 'UNAUTHENTICATED' }
  const { user, token } = auth

  if (isPlanExempt(user.account_type)) return { ok: true, user, token }

  const tier = await lookupTier(user.user_id, token)
  if (tier.kind === 'unauthorized') return { ok: false, response: UNAUTHENTICATED(), code: 'UNAUTHENTICATED' }
  if (tier.kind === 'unavailable') {
    console.error('[planGate] tier lookup unavailable for', user.user_id)
    return { ok: false, response: UNAVAILABLE(), code: 'PLAN_CHECK_UNAVAILABLE' }
  }

  let grants: TeamGrant[] = []
  if (!tier.paid && !isPaidTier(tier.tier)) {
    try {
      grants = await teamGrants(user.user_id)
    } catch (e) {
      console.error('[planGate] team lookup failed:', e)
      return { ok: false, response: UNAVAILABLE(), code: 'PLAN_CHECK_UNAVAILABLE' }
    }
  }

  const d = decidePlanAccess({ accountType: user.account_type, tier: tier.tier, paid: tier.paid, grants, module })
  if (d.ok) return { ok: true, user, token }
  if (d.code === 'MODULE_DISABLED') {
    return {
      ok: false,
      response: json(403, { error: 'feature not enabled for your team role', code: 'MODULE_DISABLED', module }),
      code: 'MODULE_DISABLED',
    }
  }
  return {
    ok: false,
    response: json(402, {
      error: 'This feature is part of the Operational plan. Upgrade to keep going.',
      code: 'UPGRADE_REQUIRED',
      requiredTier: UPGRADE_TIER,
      module,
    }),
    code: 'UPGRADE_REQUIRED',
  }
}
