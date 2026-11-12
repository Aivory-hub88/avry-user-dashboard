/**
 * Free preview: what an account without a plan sees in the dashboard.
 *
 * Free accounts (avry-backend free_accounts_enabled, 2026-11-12) get the full
 * dashboard chrome so it looks like the paid product, but only these work:
 *   - Diagnostics: 2 free runs (backend ledger FREE_GRANTS.snapshot)
 *   - Workflow Copilot: 1 free session (FREE_GRANTS.copilot)
 *   - Overview and Settings / Subscriptions (to upgrade)
 * The AI Console opens an upgrade prompt on send, and every other module is
 * shown locked behind a "paid plans only" overlay.
 *
 * This file only decides what the UI shows. Every paid API refuses a free
 * account on the server (lib/planGate.ts, avry-backend 402s), so editing any
 * of this in DevTools unlocks nothing but a blurred view.
 *
 * Pure and server-safe.
 */

/** Route prefixes shown locked to a free account. */
export const LOCKED_PATH_PREFIXES: readonly string[] = [
  '/agents',
  '/workspace',
  '/crm',
  '/blueprint',
  '/roadmap',
  '/logs',
  '/integrations',
  '/templates',
  '/approvals',
]

/** Sidebar nav keys that get a lock badge for a free account. */
export const LOCKED_NAV_KEYS: readonly string[] = [
  'agents',
  'workspace',
  'crm',
  'blueprint',
  'roadmap',
  'executionLogs',
  'integrations',
  'templates',
]

/** Copy for the lock overlay, per locked route. */
export const LOCKED_FEATURE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  '/agents': 'AI Agents',
  '/workspace': 'Workspace',
  '/crm': 'CRM',
  '/blueprint': 'Transformation Blueprint',
  '/roadmap': 'Roadmap',
  '/logs': 'Execution logs',
  '/integrations': 'Integrations',
  '/templates': 'Automation Templates',
  '/approvals': 'Approvals',
})

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

/** The locked route prefix `pathname` falls under, or null when it's open. */
export function lockedPrefixFor(pathname: string | null | undefined): string | null {
  if (!pathname) return null
  return LOCKED_PATH_PREFIXES.find((p) => matches(pathname, p)) ?? null
}

/** Where the upgrade CTA goes (the dashboard's own plans page). */
export const UPGRADE_PATH = '/dashboard/subscriptions'
