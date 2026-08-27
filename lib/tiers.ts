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
 *   snapshot    — bought Deep Diagnostic ($79)
 *   blueprint   — bought Blueprint+Roadmap ($249) or Full Stack ($299)
 *   operational — subscription $39/mo
 *   business    — subscription $99/mo
 *   enterprise  — subscription, sales-assisted
 * plus the pre-rebrand aliases `foundation` and `pro`, which older
 * `identity.user_tiers` rows still carry. `free` and any unknown tier are not
 * paid.
 *
 * The prices quoted above are the published ones; the previous version of this
 * comment still said $20 and $44, figures that had not been charged for some
 * time.
 */
export const PAID_TIERS = [
  'snapshot',
  'blueprint',
  'operational',
  'business',
  'enterprise',
  // Pre-rebrand aliases — still paid, still honoured.
  'foundation',
  'pro',
] as const

export type PaidTier = (typeof PAID_TIERS)[number]

/**
 * Subscription tiers, ascending. Mirrors `CANONICAL_TIERS` in the backend's
 * `app/services/tiers.py` — these are the same strings the marketing site
 * posts to checkout, avry-payments prices from, and the backend stores.
 */
export const SUBSCRIPTION_TIERS = ['operational', 'business', 'enterprise'] as const

export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number]

/** Pre-rebrand tier ids -> their canonical replacement. Read-only. */
export const TIER_ALIASES: Readonly<Record<string, SubscriptionTier>> = Object.freeze({
  foundation: 'operational',
  pro: 'business',
  acceleration: 'business',
  intelligence: 'enterprise',
})

/**
 * Customer-facing plan names — the one place the dashboard spells them, so it
 * cannot disagree with the pricing page or the Midtrans invoice.
 */
export const TIER_DISPLAY_NAMES: Readonly<Record<SubscriptionTier, string>> = Object.freeze({
  operational: 'Operational',
  business: 'Business',
  enterprise: 'Enterprise',
})

/**
 * Published monthly price in USD.
 *
 * `enterprise` is absent because it is sales-assisted and no figure is
 * published. These must equal `SUBSCRIPTION_PRODUCTS` in the marketing site's
 * `src/lib/pricing.ts` and `FIXED_PRICES_USD` in avry-payments' `pricing.py`:
 * the checkout call sends only a product id and the server prices it, so a
 * figure shown here that differs from the server's is one we advertise and
 * never collect.
 */
export const TIER_MONTHLY_PRICE_USD: Readonly<Record<string, number>> = Object.freeze({
  operational: 39,
  business: 99,
})

/**
 * Monthly Intelligence Credit allowance per tier.
 *
 * Must equal `TIER_ALLOWANCES` in the backend's `app/services/tiers.py`, which
 * is what is actually granted. The dashboard's plan cards previously
 * advertised 50 / 300 / 2,000 against a backend that grants 80 / 220 / 3,000.
 */
export const TIER_CREDIT_ALLOWANCE: Readonly<Record<SubscriptionTier, number>> = Object.freeze({
  operational: 80,
  business: 220,
  enterprise: 3000,
})

/**
 * Resolve any tier string (canonical, pre-rebrand alias, or cased) onto a
 * canonical subscription tier, or `null` when it names no subscription at all
 * (`free`, the one-time `snapshot`/`blueprint` grants, or an unknown value).
 */
export function toSubscriptionTier(tier: string | null | undefined): SubscriptionTier | null {
  if (!tier) return null
  const key = tier.trim().toLowerCase()
  const canonical = TIER_ALIASES[key] ?? key
  return (SUBSCRIPTION_TIERS as readonly string[]).includes(canonical)
    ? (canonical as SubscriptionTier)
    : null
}

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
