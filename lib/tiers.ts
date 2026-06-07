/**
 * lib/tiers.ts
 *
 * Server-safe, pure source of truth for the paid-tier set and the super-admin
 * account rule that gate the product dashboard and the Composio integration.
 *
 * These constants and predicates previously lived in
 * `hooks/useDashboardAccess.ts` (marked `'use client'`). Importing a client
 * module into a server route handler is fragile, so the shared rules are
 * extracted here with NO `'use client'` directive and NO browser globals —
 * safe to import from both the client hook and server route handlers, keeping a
 * single source of truth for the paid-tier set.
 *
 * Requirements: 3.2, 3.3, 3.4
 */

/**
 * Tiers permitted to use the paid features (operational dashboard + Composio
 * integration):
 *   snapshot   — bought Deep Diagnostic ($29)
 *   blueprint  — bought Blueprint+Roadmap ($85) or Full Stack ($99)
 *   foundation — subscription $20/mo
 *   pro        — subscription $44/mo
 *   enterprise — subscription $499/mo
 * `free` and any unknown tier are not paid.
 */
export const PAID_TIERS = [
  'snapshot',
  'blueprint',
  'foundation',
  'pro',
  'enterprise',
] as const

export type PaidTier = (typeof PAID_TIERS)[number]

/**
 * `account_type` (or `role`) values that bypass the paid-tier gate (Super_Admin).
 * Mirrors `ADMIN_ACCOUNT_TYPES` in `lib/authManager.ts` for legacy parity.
 */
export const ADMIN_ACCOUNT_TYPES = ['superadmin', 'admin', 'employee'] as const

/**
 * True when `tier` (compared lowercased) is a member of `PAID_TIERS`.
 *
 * Matches the existing `useDashboardAccess.isPaidTier` semantics exactly:
 * lowercase compare, no trim — a padded value such as `' pro '` is NOT paid.
 */
export function isPaidTier(tier: string | null | undefined): boolean {
  if (!tier) return false
  return (PAID_TIERS as readonly string[]).includes(tier.toLowerCase())
}

/**
 * True when the account is a Super_Admin, i.e. its `account_type` or `role` is
 * one of `ADMIN_ACCOUNT_TYPES`.
 *
 * Mirrors `isAdminUser` in `lib/authManager.ts`: membership is checked with an
 * exact (case-sensitive) comparison, and either field can grant the bypass.
 */
export function isSuperAdminAccount(
  accountType?: string | null,
  role?: string | null,
): boolean {
  const types = ADMIN_ACCOUNT_TYPES as readonly string[]
  return (
    (typeof accountType === 'string' && types.includes(accountType)) ||
    (typeof role === 'string' && types.includes(role))
  )
}
