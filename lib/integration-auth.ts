/**
 * lib/integration-auth.ts
 *
 * Server-only authentication and paid-tier gating helper for the Composio
 * Integration_API. It reads the shared cross-subdomain `.aivory.id` session
 * from the incoming request cookies (mirroring `lib/authManager.ts`, but
 * server-side from `NextRequest`), resolves the real Aivory `user_id`, enforces
 * the paid-tier gate with the super-admin bypass, and returns either a resolved
 * principal or a structured error intent.
 *
 * This module REPLACES the old `resolveUserId()` `'default'` fallback so each
 * user's Composio connections are isolated by their Aivory `user_id`
 * (== Composio `Entity_Id`). It never resolves a request to a shared,
 * anonymous, or placeholder identity.
 *
 * Structure: security- and correctness-critical logic is expressed as PURE
 * functions (`parseAivoryUser` and `decideIntegrationAccess`) that take an
 * already-parsed session and perform no I/O, wrapped by a thin orchestrator
 * (`resolveIntegrationUser`) that reads the request. This keeps the core
 * independently testable with no network and no `NextRequest`.
 *
 * Requirements: 1.1, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5
 */

import type { NextRequest } from 'next/server'
import type { User } from '@/lib/authManager'
import { isPaidTier, isSuperAdminAccount } from '@/lib/tiers'

/**
 * Shared cross-subdomain cookie keys, mirroring `SHARED_COOKIE_KEYS` in
 * `lib/authManager.ts`. The marketing site (`aivory.id`) writes these scoped to
 * `domain=.aivory.id`, so they are readable on `dashboard.aivory.id`. Values
 * are stored as `encodeURIComponent(JSON.stringify(value))`.
 */
export const SESSION_TOKEN_COOKIE = 'aivory_session_token'
export const USER_COOKIE = 'aivory_user'
/** Raw JWT, not JSON-wrapped — see `setAuthCookies` in the landing repo. */
export const ACCESS_TOKEN_COOKIE = 'aivory_access_token'

/**
 * Successful resolution: an authenticated, authorized principal.
 *
 * `userId` is the Aivory `user_id`, which is also used verbatim as the Composio
 * `Entity_Id`. `tier` is lowercased. `isSuperAdmin` is true when the paid-tier
 * gate was bypassed via the super-admin account rule.
 */
export interface ResolvedUser {
  ok: true
  userId: string
  tier: string
  isSuperAdmin: boolean
}

/**
 * Failed resolution carries the HTTP intent plus the `Error_Contract` code:
 *   - `401 / UNAUTHENTICATED` — no resolvable authenticated user.
 *   - `403 / FORBIDDEN`       — authenticated, but not paid and not super-admin.
 */
export interface AuthError {
  ok: false
  status: 401 | 403
  code: 'UNAUTHENTICATED' | 'FORBIDDEN'
  message: string
}

/**
 * Discriminated union over the `ok` field. Every route can do
 * `if (!result.ok) return errorResponse(result)` and otherwise use
 * `result.userId` / `result.tier` / `result.isSuperAdmin` with full type
 * narrowing.
 */
export type IntegrationAuthResult = ResolvedUser | AuthError

/* ---- Pure helpers (no I/O) ---- */

/**
 * Parse the shared `aivory_user` cookie value into a `User`.
 *
 * Mirrors `authManager.readSharedCookie`, which does
 * `JSON.parse(decodeURIComponent(value))`. Server-side,
 * `req.cookies.get(USER_COOKIE)?.value` returns the stored cookie string; to
 * mirror the client exactly while staying robust to whether the runtime has
 * already decoded the value, this tries the decoded parse first and falls back
 * to a raw parse:
 *
 *   try { return JSON.parse(decodeURIComponent(raw)) }
 *   catch { try { return JSON.parse(raw) } catch { return null } }
 *
 * A parsed value is only accepted when it has a non-empty string `user_id`.
 * Returns `null` on any missing/blank/unparseable/invalid input. Never throws.
 */
export function parseAivoryUser(raw: string | undefined | null): User | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null

  let parsed: unknown
  try {
    parsed = JSON.parse(decodeURIComponent(raw))
  } catch {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
  }

  const userId = extractUserId(parsed)
  if (!userId) return null

  // Normalize to `user_id` regardless of which field the cookie actually
  // carried, so every downstream reader of `User.user_id` (this file's own
  // decideIntegrationAccess included) sees a consistent shape.
  return { ...(parsed as object), user_id: userId } as User
}

/**
 * Extracts a non-empty string user id from the parsed cookie payload, or
 * `null` if none is present. This is the minimum the gating logic relies
 * on; the remaining `User` fields (e.g. `tier`, `account_type`) are read
 * defensively downstream.
 *
 * Real bug found live: the shared `aivory_user` cookie is written by the
 * landing repo's `auth.ts` (`setAuthCookies`) with the field named `id`,
 * not `user_id` — the `User` type here (and every consumer of it) has
 * always expected `user_id`. Checking `user_id` only meant this function
 * silently rejected every real, correctly-authenticated session — the
 * entire cookie-based Composio integration path (Connections tab) 401'd
 * unconditionally regardless of login state, never actually verified end-
 * to-end against a real cookie until now. Accepting `id` as a fallback
 * fixes real traffic without needing to touch the cookie-writing side.
 */
function extractUserId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const withUserId = (value as { user_id?: unknown }).user_id
  if (typeof withUserId === 'string' && withUserId.trim() !== '') return withUserId
  const withId = (value as { id?: unknown }).id
  if (typeof withId === 'string' && withId.trim() !== '') return withId
  return null
}

/* ---- Pure gating decision (no I/O) ---- */

/**
 * Pure gating decision over an already-parsed session. Performs no I/O and
 * never touches `NextRequest`, so it is fully unit/property testable. The
 * orchestrator `resolveIntegrationUser` (Task 2.4) reads the request cookies and
 * delegates the actual decision here.
 *
 * Decision table (mirrors the design's `resolveIntegrationUser` behavior
 * summary):
 *
 *   | Input condition                                  | Result                                    |
 *   | ------------------------------------------------ | ----------------------------------------- |
 *   | No session token / blank token                   | AuthError 401 UNAUTHENTICATED             |
 *   | No user / no non-empty `user_id`                 | AuthError 401 UNAUTHENTICATED             |
 *   | Authenticated, `isSuperAdminAccount` true        | ResolvedUser { isSuperAdmin: true }       |
 *   | Authenticated, `tier ∈ PAID_TIERS`               | ResolvedUser { isSuperAdmin: false }      |
 *   | Authenticated, not paid, not super-admin         | AuthError 403 FORBIDDEN                    |
 *
 * The resolved `userId` always equals the session user's `user_id`; this
 * function never returns `'default'` or any placeholder identity.
 *
 * Requirements: 1.1, 1.5, 2.2, 2.5, 3.1, 3.2, 3.3, 3.4
 */
export function decideIntegrationAccess(input: {
  sessionToken: string | null
  user: User | null
}): IntegrationAuthResult {
  const { sessionToken, user } = input

  // 401: no usable session token (missing/blank).
  if (typeof sessionToken !== 'string' || sessionToken.trim() === '') {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Authentication required to access integrations.',
    }
  }

  // 401: no resolvable authenticated user (null, or no non-empty `user_id`).
  const hasUserId =
    !!user && typeof user.user_id === 'string' && user.user_id.trim() !== ''
  if (!user || !hasUserId) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Authentication required to access integrations.',
    }
  }

  // `userId` is the Aivory `user_id` verbatim — never trimmed/altered, never a
  // placeholder such as `'default'` — so it is used as-is for the Composio
  // `Entity_Id`.
  const userId = user.user_id
  const tier = typeof user.tier === 'string' ? user.tier.toLowerCase() : ''

  // Super-admin bypass: paid-tier gate is skipped, tier is ignored.
  if (isSuperAdminAccount(user.account_type, user.role)) {
    return { ok: true, userId, tier, isSuperAdmin: true }
  }

  // Paid-tier gate.
  if (isPaidTier(tier)) {
    return { ok: true, userId, tier, isSuperAdmin: false }
  }

  // 403: authenticated but neither paid nor super-admin.
  return {
    ok: false,
    status: 403,
    code: 'FORBIDDEN',
    message: 'A paid plan is required to use integrations.',
  }
}

/* ---- Orchestrator (reads the request) ---- */

/** Tier lookup must resolve within this bound, else the paid-tier gate fails
 *  closed to `free` rather than hang the request — same bound and fail-
 *  closed posture `useDashboardAccess.ts`'s (unused) tier lookup already
 *  established as the right default for this class of call. */
const TIER_LOOKUP_TIMEOUT_MS = 5000

/**
 * Fetches the caller's current tier fresh from the backend, given their raw
 * access-token JWT. Real bug found live: the shared `aivory_user` cookie
 * never carries a `tier` field at all (`setAuthCookies` in the landing
 * repo's auth.ts only copies id/email/account_type/role/allowed_modules) —
 * every paid-tier check here was silently reading `''`, so the Composio
 * Connections gate 403'd for every account regardless of plan, the same
 * class of bug (stale/missing tier claim checked directly instead of
 * re-loaded) already found and fixed this session in agent_api_keys.py and
 * tenant_mcp_servers.py on the backend side.
 *
 * `useDashboardAccess.ts` already has a `lookupTier()` for this shape of
 * call, but its `TIER_LOOKUP_PATH` (`/api/v1/users/me`) 404s against the
 * real backend and the function is dead code (never invoked) — confirmed
 * live rather than assumed. The real, working endpoint is `GET /api/v1/
 * auth/me` (`backend/avry-backend/app/routes/auth.py`), which returns a
 * real `UserResponse` including a genuine, freshly-loaded `tier` field.
 */
async function fetchFreshTier(accessToken: string): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIER_LOOKUP_TIMEOUT_MS)
  try {
    const res = await fetch(`${base}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = (await res.json().catch(() => null)) as { tier?: unknown } | null
    return data && typeof data.tier === 'string' ? data.tier : null
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Resolve + gate the caller from the incoming `NextRequest` cookies.
 *
 * This is the thin I/O wrapper around the pure core: it reads the shared
 * cross-subdomain session cookies (`aivory_session_token`, `aivory_user`) off
 * `req.cookies`, parses the user via `parseAivoryUser`, fetches a fresh tier
 * (the cookie never carries one — see `fetchFreshTier`), and delegates the
 * authentication/paid-tier decision to `decideIntegrationAccess`.
 *
 * This REPLACES the old `resolveUserId()` `'default'` fallback: a request is
 * either resolved to a real Aivory `user_id` (== Composio `Entity_Id`) or it is
 * rejected with a structured `AuthError`. It never resolves to a shared,
 * anonymous, or placeholder identity.
 *
 * Requirements: 1.1, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5
 */
export async function resolveIntegrationUser(req: NextRequest): Promise<IntegrationAuthResult> {
  const sessionToken = req.cookies.get(SESSION_TOKEN_COOKIE)?.value ?? null
  const user = parseAivoryUser(req.cookies.get(USER_COOKIE)?.value)

  let tier = 'free'
  if (user) {
    const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value ?? null
    tier = (accessToken ? await fetchFreshTier(accessToken) : null) ?? 'free'
  }

  // `User`'s other fields (is_subscribed, has_diagnostic, credits, ...) are
  // never actually present on the shared cookie either — parseAivoryUser's
  // own cast already accepts that mismatch; this spread keeps the same
  // posture rather than pretending a fuller shape exists.
  return decideIntegrationAccess({ sessionToken, user: user ? ({ ...user, tier } as User) : null })
}
