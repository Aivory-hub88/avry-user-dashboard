/**
 * SSR-safe accessors for browser globals and legacy client managers.
 *
 * During server-side rendering (SSR) — `next build` and the initial server
 * response, before client hydration — the browser globals `window` and
 * `navigator`, and the legacy `AuthManager` / `UserStateManager` (injected by
 * `frontend/*.js` at runtime in the browser) are unavailable. Reading them
 * directly throws `ReferenceError` and breaks the build.
 *
 * These guarded accessors return server-safe defaults instead of throwing, so
 * the same code path runs on the server and the client without `typeof window`
 * checks scattered everywhere.
 *
 * Requirements: 10.2, 10.5
 */

/* -------------------------------------------------------------------------- */
/* Ambient global typings                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Minimal shape of the legacy global `AuthManager` (from
 * `frontend/auth-manager.js`). Only the members the dashboard reads are typed;
 * everything else is accessed defensively.
 */
export interface GlobalAuthManager {
  isAuthenticated: () => boolean
  getUser: () => unknown
  getUserId: () => string | null
  isSuperAdmin: () => boolean
  isAdmin: () => boolean
  getRedirectUrl: () => string
  [key: string]: unknown
}

/**
 * Minimal shape of the legacy global `UserStateManager` (from
 * `frontend/user-state-manager.js`).
 */
export interface GlobalUserStateManager {
  isLoaded: () => boolean
  getTier: () => string | null
  getUserState: () => unknown
  [key: string]: unknown
}

declare global {
  interface Window {
    AuthManager?: GlobalAuthManager
    UserStateManager?: GlobalUserStateManager
  }
}

/* -------------------------------------------------------------------------- */
/* Render-environment predicates                                              */
/* -------------------------------------------------------------------------- */

/**
 * True while running on the server (SSR), where `window` is undefined.
 * Requirement 10.1 / 10.2: callers use this to short-circuit to safe defaults.
 */
export function isServerRender(): boolean {
  return typeof window === 'undefined'
}

/**
 * True when running in the browser after hydration, where `window` exists.
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

/* -------------------------------------------------------------------------- */
/* Guarded browser-global accessors                                           */
/* -------------------------------------------------------------------------- */

/**
 * Returns the `window` object in the browser, or `null` during SSR.
 * Never throws (Req 10.5).
 */
export function getWindow(): (Window & typeof globalThis) | null {
  return isServerRender() ? null : window
}

/**
 * Returns the `navigator` object in the browser, or `null` during SSR or when
 * `navigator` is unavailable. Never throws (Req 10.5).
 */
export function getNavigator(): Navigator | null {
  if (isServerRender()) return null
  return typeof navigator === 'undefined' ? null : navigator
}

/* -------------------------------------------------------------------------- */
/* Guarded legacy-manager accessors                                           */
/* -------------------------------------------------------------------------- */

/**
 * Returns the global `AuthManager` when it has been injected in the browser,
 * or `null` during SSR / before the legacy script loads. Never throws
 * (Req 10.2, 10.5).
 */
export function getAuthManager(): GlobalAuthManager | null {
  const win = getWindow()
  if (!win) return null
  return win.AuthManager ?? null
}

/**
 * Returns the global `UserStateManager` when it has been injected in the
 * browser, or `null` during SSR / before the legacy script loads. Never throws
 * (Req 10.2, 10.5).
 */
export function getUserStateManager(): GlobalUserStateManager | null {
  const win = getWindow()
  if (!win) return null
  return win.UserStateManager ?? null
}
