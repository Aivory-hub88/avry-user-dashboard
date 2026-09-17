/**
 * Per-user localStorage namespacing.
 *
 * Leaf module (no imports) — chat history and the console thread pointer
 * used to live under global keys, so logout's cache sweep wiped every
 * thread and the next login started with amnesia ("chat tidak terekam").
 * Namespacing by user id keeps one account's threads invisible to the next
 * login on a shared device WITHOUT deleting anyone's data.
 */

const AUTH_KEY = 'aivory_auth'

/** Current logged-in user id, or null when logged out / SSR. */
export function currentUserId(): string | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    const id = JSON.parse(raw)?.user?.id
    return typeof id === 'string' && id.length > 0 ? id : null
  } catch {
    return null
  }
}

function sanitizeUserId(uid: string): string {
  return uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'anon'
}

/**
 * Storage key for `base`, namespaced to the current user when logged in.
 * Logged out (or SSR) falls back to the bare base key — the landing page
 * has no chat, so nothing meaningful is ever written there.
 */
export function scopedKey(base: string): string {
  const uid = currentUserId()
  return uid ? `${base}__u_${sanitizeUserId(uid)}` : base
}

/**
 * One-time move of a legacy global key into its namespaced successor.
 * Moves (not copies) so a stale global value can never leak into a
 * different user's namespace on a later login. No-op when already moved,
 * when there is nothing to move, or when logged out.
 */
export function claimLegacyKey(base: string): string {
  const namespaced = scopedKey(base)
  if (namespaced === base) return base
  try {
    if (localStorage.getItem(namespaced) === null) {
      const legacy = localStorage.getItem(base)
      if (legacy !== null) {
        localStorage.setItem(namespaced, legacy)
      }
    }
    // The global slot must not survive regardless — otherwise the next
    // login as a *different* user would claim these same threads.
    localStorage.removeItem(base)
  } catch {
    // Storage unavailable (private browsing): callers already degrade.
  }
  return namespaced
}
