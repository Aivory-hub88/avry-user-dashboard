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

  if (!isUserWithId(parsed)) return null

  return parsed
}

/**
 * Type guard: the parsed value is an object carrying a non-empty string
 * `user_id`. This is the minimum the gating logic relies on; the remaining
 * `User` fields (e.g. `tier`, `account_type`) are read defensively downstream.
 */
function isUserWithId(value: unknown): value is User {
  if (typeof value !== 'object' || value === null) return false
  const userId = (value as { user_id?: unknown }).user_id
  return typeof userId === 'string' && userId.trim() !== ''
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

/**
 * Resolve + gate the caller from the incoming `NextRequest` cookies.
 *
 * This is the thin I/O wrapper around the pure core: it reads the shared
 * cross-subdomain session cookies (`aivory_session_token`, `aivory_user`) off
 * `req.cookies`, parses the user via `parseAivoryUser`, and delegates the
 * authentication/paid-tier decision to `decideIntegrationAccess`. It performs
 * no network I/O and never throws.
 *
 * This REPLACES the old `resolveUserId()` `'default'` fallback: a request is
 * either resolved to a real Aivory `user_id` (== Composio `Entity_Id`) or it is
 * rejected with a structured `AuthError`. It never resolves to a shared,
 * anonymous, or placeholder identity.
 *
 * Requirements: 1.1, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5
 */
export function resolveIntegrationUser(req: NextRequest): IntegrationAuthResult {
  const sessionToken = req.cookies.get(SESSION_TOKEN_COOKIE)?.value ?? null
  const user = parseAivoryUser(req.cookies.get(USER_COOKIE)?.value)

  return decideIntegrationAccess({ sessionToken, user })
}
