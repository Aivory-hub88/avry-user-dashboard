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
 *   operational — subscription $20/mo
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
  operational: 20,
  business: 99,
})

/**
 * One-time Complete Transformation Package (product `ai_fullstack`) — the
 * same $299 the settings page sells, and it includes the first month of the
 * Business plan. Used by the Deep Diagnostic's required-investment estimate.
 */
export const FULLSTACK_PACKAGE_PRICE_USD = 299
export const FULLSTACK_INCLUDED_PLAN_MONTHS = 1

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
 * Distributor-partner accounts, created from the admin dashboard. They hold a
 * regular Enterprise entitlement (free for the months the admin granted, then
 * a paid subscription), so every tier gate treats them like any customer on
 * that plan. They are not staff: no admin powers, no paid-tier bypass.
 */
export const PARTNER_ACCOUNT_TYPE = 'partner'

/**
 * Whether the account may deploy into, or read workflows from, Aivory's own
 * self-hosted n8n instance (N8N_BASE_URL / N8N_API_KEY). Superadmins only —
 * it exists for battle-testing. Every other account, partners included,
 * brings its own n8n.
 *
 * Pass the `account_type` claim from the verified JWT, never a value the
 * browser stored.
 */
export function canUseAivoryN8nInstance(accountType: string | null | undefined): boolean {
  return accountType === 'superadmin'
}

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

/**
 * Every Aivory account is paid; there is no free plan. An account with no live
 * plan (a lapsed subscription, a partner whose free months ended) is "not
 * activated" until it pays. Internally that state is still the tier value
 * `free`, because every gate across the services compares against it, but it
 * must never be shown to anyone as a "Free" plan or account.
 */
export const NOT_ACTIVATED_LABEL = 'Not activated'
export const NOT_ACTIVATED_HINT = 'Activates once you pay'

const ONE_TIME_LABELS: Readonly<Record<string, string>> = Object.freeze({
  snapshot: 'Assessment',
  blueprint: 'Blueprint',
})

/** Whether the account currently holds something paid (or is staff/demo). */
export function isActivated(
  tier: string | null | undefined,
  accountType?: string | null,
): boolean {
  if (isSuperAdminAccount(accountType)) return true
  if (accountType === 'demo') return true
  return isPaidTier(tier)
}

/** The plan name to show for an account. Never "Free". */
export function planLabel(tier: string | null | undefined, accountType?: string | null): string {
  if (isSuperAdminAccount(accountType)) return 'Admin'
  if (accountType === 'demo') return 'Demo'
  if (!isPaidTier(tier)) return NOT_ACTIVATED_LABEL
  if (accountType === PARTNER_ACCOUNT_TYPE) return 'Partner'
  const subscription = toSubscriptionTier(tier)
  if (subscription) return TIER_DISPLAY_NAMES[subscription]
  return ONE_TIME_LABELS[(tier ?? '').toLowerCase()] ?? NOT_ACTIVATED_LABEL
}

/** The account kind to show. The internal `free` / `paid` / `user` values all
 *  read as an ordinary customer account. */
export function accountTypeLabel(accountType: string | null | undefined): string {
  if (isSuperAdminAccount(accountType)) return 'Admin'
  if (accountType === PARTNER_ACCOUNT_TYPE) return 'Partner'
  if (accountType === 'demo') return 'Demo'
  return 'Customer'
}
