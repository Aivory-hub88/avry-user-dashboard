/**
 * Keep the landing's access-token cookies in step with a client-side refresh.
 *
 * The landing (frontend-nextjs `setAuthCookies`) writes the access token at
 * login as two host-only cookies on aivory.id, which this app (basePath
 * /dashboard, same host) shares:
 *   - `aivory_access_token`  — raw JWT, read by server routes
 *     (lib/serverAuth, app/api/agents, app/api/agent-catalog) and the admin
 *     middleware
 *   - `aivory_session_token` — the same JWT, JSON-wrapped; AuthManager's
 *     getAccessToken() prefers it over localStorage
 *
 * `tryRefresh` in lib/deployAuth used to update only localStorage, so after
 * the first refresh both cookies kept the old token: server routes that read
 * the cookie saw an expired token, and authedFetch kept sending the stale
 * cookie token and refreshing again on every call.
 *
 * Only a session that already has these cookies is updated. A session that
 * never had them (dashboard-only login) is left as it was, because this
 * app's logout does not clear cookies, and a cookie created here would
 * outlive that logout.
 */

export const ACCESS_COOKIE = 'aivory_access_token'
export const SESSION_COOKIE = 'aivory_session_token'

// Same attributes as the landing's setAuthCookies, so this overwrites that
// cookie instead of adding a second one with a different scope.
const COOKIE_ATTRS = 'path=/; max-age=604800; SameSite=Lax'

function hasCookie(cookieHeader: string, name: string): boolean {
  return cookieHeader
    .split(';')
    .some((part) => part.trim().startsWith(`${name}=`) && part.trim().length > name.length + 1)
}

/** Overwrite the access-token cookies with `accessToken`, if this session has them. */
export function syncAccessTokenCookies(accessToken: string): void {
  if (typeof document === 'undefined' || !accessToken) return
  const current = document.cookie || ''
  if (!hasCookie(current, ACCESS_COOKIE) && !hasCookie(current, SESSION_COOKIE)) return
  document.cookie = `${ACCESS_COOKIE}=${accessToken}; ${COOKIE_ATTRS}`
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(JSON.stringify(accessToken))}; ${COOKIE_ATTRS}`
}
