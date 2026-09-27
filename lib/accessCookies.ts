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
 * never had them (dashboard-only login) is left as it was: there is nothing
 * to keep current.
 *
 * `clearAuthCookies` is the other half: logout removes them, so server
 * routes stop accepting the token the moment the user signs out.
 */

export const ACCESS_COOKIE = 'aivory_access_token'
export const SESSION_COOKIE = 'aivory_session_token'
export const USER_COOKIE = 'aivory_user'

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

// Host-only is what the landing writes today; the domain-wide variants are
// what older landing builds wrote (.aivory.id) and what the site's current
// domain would carry (.aivory.uk). Expiring all three leaves no copy behind.
const CLEAR_SCOPES = ['', '; domain=.aivory.id', '; domain=.aivory.uk']

/** Expire every auth cookie the landing may have set, in every scope it used. */
export function clearAuthCookies(): void {
  if (typeof document === 'undefined') return
  for (const name of [ACCESS_COOKIE, SESSION_COOKIE, USER_COOKIE]) {
    for (const scope of CLEAR_SCOPES) {
      document.cookie = `${name}=; path=/${scope}; max-age=0; SameSite=Lax`
    }
  }
}
