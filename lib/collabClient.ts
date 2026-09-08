/**
 * Client-side collab credential accessor (browser only).
 *
 * aivory-collab now requires a credential on every WS upgrade (`?token=`) and
 * HTTP call (`Authorization: Bearer`), verified against the same HS256 JWT
 * the dashboard issues. This mirrors lib/deployAuth.currentToken() without the
 * refresh loop (the WS connection and octet-stream PUTs are best-effort; the
 * Next API proxy is the refresh boundary).
 */
import { AuthManager } from '@/lib/authManager'

export function collabToken(): string | null {
  if (typeof window === 'undefined') return null
  const fromManager = AuthManager.getAccessToken()
  if (fromManager) return fromManager
  try {
    const raw = localStorage.getItem('aivory_auth')
    if (raw) {
      const s = JSON.parse(raw)
      if (s?.access_token) return s.access_token
    }
  } catch {
    /* ignore malformed session */
  }
  return null
}

export function collabAuthHeaders(): Record<string, string> {
  const token = collabToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function collabWsParams(): Record<string, string> {
  const token = collabToken()
  return token ? { token } : {}
}

/** Clear browser credentials after the server rejects the current session. */
export function clearClientAuthSession(): void {
  if (typeof window === "undefined") return
  for (const key of ["aivory_auth", "auth_token", "user_data", "user_id"]) {
    localStorage.removeItem(key)
  }
  for (const key of ["aivory_access_token", "aivory_session_token", "aivory_user"]) {
    document.cookie = `${key}=; path=/; max-age=0; SameSite=Lax`
    document.cookie = `${key}=; path=/; domain=.aivory.uk; max-age=0; SameSite=Lax`
  }
  window.dispatchEvent(new Event("authManager:logout"))
}
