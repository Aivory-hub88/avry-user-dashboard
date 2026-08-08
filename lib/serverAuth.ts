/**
 * Server-side JWT verification for the dashboard's own API routes.
 *
 * Tokens are issued by avry-backend (HS256, shared JWT_SECRET env, payload
 * `{user_id, email, account_type}` — see backend app/routes/deps.py). The
 * token is accepted from the `Authorization: Bearer` header (client modules
 * hold it in the `aivory_auth` localStorage session) or the
 * `aivory_access_token` cookie (set at login, used by the existing proxy
 * routes).
 *
 * No fallback secret: a missing JWT_SECRET throws instead of silently
 * verifying against a well-known default.
 */
import type { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'

export interface AuthUser {
  user_id: string
  email?: string
  account_type?: string
}

/** Returns the verified user, or null when the request carries no valid token. */
export function getAuthUser(request: NextRequest): AuthUser | null {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET env var is required — refusing to verify tokens against a default secret')
  }

  const bearer = request.headers.get('authorization')
  // Cookie fallbacks cover both names in use: `aivory_access_token` (set at
  // login by the dashboard's own proxy routes) and `aivory_session_token`
  // (the cross-subdomain SSO cookie the landing-site login writes, which
  // AuthManager reads).
  //
  // Try every candidate in order rather than picking exactly one source and
  // committing to it: the Bearer header (from localStorage's access token)
  // expires after ~60 minutes with no auto-refresh on THIS specific cookie
  // pair, while a route calling this via authedFetch always attaches
  // whatever token localStorage currently holds, valid or not. Stopping at
  // the first present-but-expired candidate used to hard-fail the request
  // even when a still-valid cookie was sitting right there — every
  // reload/executions/fixtures call regressed from "no credentials saved"
  // (400) to "not authenticated at all" (401) the moment authedFetch was
  // wired into WorkflowCanvas.tsx, despite the user's cookie session being
  // perfectly fine.
  const candidates = [
    bearer?.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : null,
    request.cookies.get('aivory_access_token')?.value ?? null,
    request.cookies.get('aivory_session_token')?.value ?? null,
  ].filter((t): t is string => Boolean(t))

  for (const token of candidates) {
    try {
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'] })
      if (typeof payload !== 'object' || payload === null) continue
      const p = payload as Record<string, unknown>
      const userId = typeof p.user_id === 'string' && p.user_id
        ? p.user_id
        : typeof p.sub === 'string' && p.sub ? p.sub : null
      if (!userId) continue
      return {
        user_id: userId,
        email: typeof p.email === 'string' ? p.email : undefined,
        account_type: typeof p.account_type === 'string' ? p.account_type : undefined,
      }
    } catch {
      // This candidate didn't verify — try the next one instead of failing
      // the whole request on it.
    }
  }
  return null
}
