/**
 * lib/moduleAccess.ts
 *
 * Server-safe, pure source of truth for per-module access.
 *
 * Today the only restricted account kind is the `demo` account (created from
 * the admin dashboard for demos/tests). Each demo account carries its own
 * `allowed_modules` list (chosen at creation time in the admin dashboard,
 * stored on the `users` row, returned by the backend on login/`/auth/me`).
 * A demo login with no explicit list (accounts created before this existed)
 * falls back to the fixed default set below. Normal accounts are unaffected
 * (they keep full access). No `'use client'` directive and no browser globals
 * here so both the client sidebar/guard and any server code can import it.
 */

/** account_type value for limited demo/test product users. */
export const DEMO_ACCOUNT_TYPE = 'demo'

/**
 * Sidebar nav keys a demo account may access when it has no explicit
 * `allowed_modules` of its own. Mirrors the `key` values used in
 * `components/shared/Sidebar.tsx` and VALID_MODULE_KEYS in the backend's
 * app/routes/admin_users.py.
 */
export const DEMO_ALLOWED_NAV_KEYS = [
  'console',
  'diagnostics',
  'blueprint',
  'roadmap',
] as const

/**
 * Route path prefix for every module key. Used to resolve which paths a
 * demo account's `allowed_modules` list unlocks.
 */
export const MODULE_PATH_PREFIXES: Record<string, string> = {
  console: '/console',
  diagnostics: '/diagnostics',
  blueprint: '/blueprint',
  roadmap: '/roadmap',
  workflows: '/workflows',
  executionLogs: '/logs',
  integrations: '/integrations',
  templates: '/templates',
  agents: '/agents',
  profile: '/overview',
}

/** Where a demo account is sent when it hits a locked route. */
export const DEMO_HOME_PATH = '/console'

/** True when the account is a limited demo/test user. */
export function isDemoAccount(accountType: string | null | undefined): boolean {
  return typeof accountType === 'string' && accountType.toLowerCase() === DEMO_ACCOUNT_TYPE
}

/**
 * Resolve the effective module list for a demo account: its own
 * `allowed_modules` if set, otherwise the fixed default set (pre-existing
 * accounts created before per-account allowlists existed).
 */
function effectiveModules(allowedModules: string[] | null | undefined): readonly string[] {
  return allowedModules && allowedModules.length > 0 ? allowedModules : DEMO_ALLOWED_NAV_KEYS
}

/** True when a demo account with the given allowlist may see/use `key`. */
export function isNavKeyAllowedForDemo(key: string, allowedModules?: string[] | null): boolean {
  return effectiveModules(allowedModules).includes(key)
}

/**
 * True when a demo account with the given allowlist may visit `pathname`.
 * Matches either the exact allowed path or a sub-path (e.g.
 * `/diagnostics/deep`). `pathname` should be the app path without query
 * string.
 */
export function isPathAllowedForDemo(pathname: string, allowedModules?: string[] | null): boolean {
  if (!pathname) return false
  return effectiveModules(allowedModules).some((key) => {
    const prefix = MODULE_PATH_PREFIXES[key]
    if (!prefix) return false
    return pathname === prefix || pathname.startsWith(prefix + '/')
  })
}

/**
 * Filter a decision for an arbitrary account. Returns true when the account may
 * access the nav key. Non-demo accounts are always allowed (full access today).
 */
export function canAccessNavKey(
  accountType: string | null | undefined,
  key: string,
  allowedModules?: string[] | null,
): boolean {
  if (!isDemoAccount(accountType)) return true
  return isNavKeyAllowedForDemo(key, allowedModules)
}

/**
 * Whether the account may visit `pathname`. Non-demo accounts always may.
 */
export function canAccessPath(
  accountType: string | null | undefined,
  pathname: string,
  allowedModules?: string[] | null,
): boolean {
  if (!isDemoAccount(accountType)) return true
  return isPathAllowedForDemo(pathname, allowedModules)
}
