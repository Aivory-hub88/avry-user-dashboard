/**
 * Authenticated fetch for the deployable-agent APIs.
 *
 * Backend access tokens expire after 15 minutes and the dashboard has no
 * global auto-refresh, so any deploy click >15min after login used to fail
 * with "Invalid or expired token". This wrapper retries once after
 * exchanging the stored refresh_token via /api/v1/auth/refresh.
 */

import { AuthManager } from './authManager'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

const SESSION_KEY = 'aivory_auth'

function readSession(): any | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function currentToken(): string | null {
  return AuthManager.getAccessToken() || readSession()?.access_token || null
}

async function tryRefresh(): Promise<string | null> {
  const session = readSession()
  const refreshToken = session?.refresh_token
  if (!refreshToken) return null
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return null
    const tokens = await res.json()
    if (!tokens?.access_token) return null
    session.access_token = tokens.access_token
    if (tokens.refresh_token) session.refresh_token = tokens.refresh_token
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    // keep the cross-port fallback token in sync too
    localStorage.setItem('auth_token', tokens.access_token)
    return tokens.access_token
  } catch {
    return null
  }
}

export async function authedFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const doFetch = (token: string | null) =>
    fetch(input, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

  let res = await doFetch(currentToken())
  if (res.status === 401) {
    const fresh = await tryRefresh()
    if (fresh) res = await doFetch(fresh)
  }
  return res
}
