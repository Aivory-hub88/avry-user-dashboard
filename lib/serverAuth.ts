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
  const token = bearer?.startsWith('Bearer ')
    ? bearer.slice('Bearer '.length)
    : request.cookies.get('aivory_access_token')?.value
  if (!token) return null

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] })
    if (typeof payload !== 'object' || payload === null) return null
    const p = payload as Record<string, unknown>
    const userId = typeof p.user_id === 'string' && p.user_id
      ? p.user_id
      : typeof p.sub === 'string' && p.sub ? p.sub : null
    if (!userId) return null
    return {
      user_id: userId,
      email: typeof p.email === 'string' ? p.email : undefined,
      account_type: typeof p.account_type === 'string' ? p.account_type : undefined,
    }
  } catch {
    return null
  }
}
