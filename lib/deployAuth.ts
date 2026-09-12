/**
 * Authenticated fetch for the deployable-agent APIs.
 *
 * Backend access tokens expire after 15 minutes and the dashboard has no
 * global auto-refresh, so any deploy click >15min after login used to fail
 * with "Invalid or expired token". This wrapper retries once after
 * exchanging the stored refresh_token via /api/v1/auth/refresh.
 *
 * This is the one choke point every authenticated data module in the
 * dashboard goes through (agent approvals, deployments, memory, profiles,
 * MCP servers, tool scope, workflow credentials, report storage, and more —
 * see the import list). When the *server* explicitly rejects the refresh
 * token (not a network blip — a real response saying it's invalid or the
 * session is gone), this used to just return null and let the caller re-try
 * the original 401 next time with the exact same dead token: no logout, no
 * localStorage cleanup, no redirect. Every poller in the app (approvals
 * every 60s, deployments, thread activity, …) would then hammer
 * /api/v1/auth/refresh forever with a token the backend will never accept
 * again, the only visible symptom being "Could not load approvals" with a
 * retry button that can never succeed. Confirmed live: avry-backend logs
 * showed a steady stream of "Token refresh failed: Invalid or expired
 * refresh token" from many concurrent sessions, each retried indefinitely.
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

// Guards against every poller that hits a dead session in the same tick
// (approvals, deployments, thread activity, …) each independently redirecting
// — only the first one to confirm the refresh token is truly dead acts on it.
let sessionInvalidated = false

function handleDeadSession() {
  if (sessionInvalidated) return
  sessionInvalidated = true
  // Dynamic import avoids a module cycle risk (lib/auth.ts is imported all
  // over the app; this file should stay a leaf) and keeps this cold path
  // out of every authedFetch call's synchronous work.
  import('./auth').then(({ logout }) => logout()).catch(() => {
    // logout() itself only touches localStorage + does a location redirect,
    // so this catch is just defence against the dynamic import failing to
    // resolve at all (e.g. mid-navigation teardown) — nothing to recover.
  })
}

async function tryRefresh(): Promise<string | null> {
  const session = readSession()
  const refreshToken = session?.refresh_token
  if (!refreshToken) return null
  let res: Response
  try {
    res = await fetch(`${BACKEND_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  } catch {
    // Network-level failure (offline, DNS blip, backend restart mid-request)
    // says nothing about whether the refresh token itself is still good —
    // never treat this as "log the user out".
    return null
  }
  if (!res.ok) {
    // The server actually looked at this refresh token and rejected it —
    // expired past its 7-day window, the session row is gone, or it was
    // signed under a JWT_SECRET the backend no longer honours. Retrying with
    // the same token later cannot succeed, so this is the one place that
    // gets to declare the session genuinely dead rather than leaving every
    // caller to silently retry it forever.
    handleDeadSession()
    return null
  }
  const tokens = await res.json()
  if (!tokens?.access_token) return null
  session.access_token = tokens.access_token
  if (tokens.refresh_token) session.refresh_token = tokens.refresh_token
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  // keep the cross-port fallback token in sync too
  localStorage.setItem('auth_token', tokens.access_token)
  return tokens.access_token
}

export async function authedFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  // A FormData body needs the browser's own multipart boundary in
  // Content-Type — forcing application/json here would break the upload.
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData
  const doFetch = (token: string | null) =>
    fetch(input, {
      ...init,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
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
