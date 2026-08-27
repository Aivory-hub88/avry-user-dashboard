/**
 * Subscription plan catalog and pure helpers (server-safe, no `'use client'`).
 *
 * Plan names and prices are derived from `lib/tiers.ts` rather than restated,
 * because restating them is exactly how this module went wrong before: it
 * mapped the paying `foundation` tier onto a "Free / $0" plan and had no entry
 * for `pro` at all, so the fallback sent that tier to "Free" too. Both plans
 * are charged monthly, so every Operational and Business subscriber saw their
 * plan reported as Free at $0 on the Subscription and Wallet pages.
 *
 * It also listed the one-time products (Deep Diagnostic, Blueprint) as monthly
 * plans at prices they are not sold for. They are purchases, not
 * subscriptions, and a tier holding only those now reports no subscription.
 */

import {
  SUBSCRIPTION_TIERS,
  TIER_DISPLAY_NAMES,
  TIER_MONTHLY_PRICE_USD,
  toSubscriptionTier,
  type SubscriptionTier,
} from "@/lib/tiers"

export interface Plan {
  /** Canonical tier id, or `null` for the no-subscription placeholder. */
  tier: SubscriptionTier | null
  name: string
  /** Monthly price in USD, or `null` when there is no published figure. */
  price: number | null
  /** Ready-to-render price, e.g. `"$39/month"`, `"Custom"`, `"—"`. */
  priceLabel: string
  features: string[]
}

const FEATURES: Record<SubscriptionTier, string[]> = {
  operational: [
    "Operational Workspace",
    "Business Workflows",
    "1 AI Workforce",
    "Operational Dashboard",
    "Standard Governance",
    "Telegram or Slack",
    "Multilingual",
  ],
  business: [
    "Multi-team Workspace",
    "Advanced Business Workflows",
    "3 AI Workforce Units",
    "Executive Dashboard",
    "Department Governance",
    "Multi-channel Deployment",
    "Operational Orchestration",
    "Usage Analytics",
  ],
  enterprise: [
    "Unlimited Operational Workspaces",
    "Unlimited AI Workforce",
    "Unlimited Business Workflows",
    "Enterprise Integrations",
    "Advanced Governance",
    "Audit Logs",
    "SSO",
    "Private Deployment",
    "Dedicated Success Manager",
    "SLA",
  ],
}

function buildPlan(tier: SubscriptionTier): Plan {
  const price = TIER_MONTHLY_PRICE_USD[tier] ?? null
  return {
    tier,
    name: TIER_DISPLAY_NAMES[tier],
    price,
    // Enterprise publishes no figure — it is sales-assisted.
    priceLabel: price === null ? "Custom" : `$${price}/month`,
    features: FEATURES[tier],
  }
}

/** The subscription plans, keyed by canonical tier id. */
export const PLANS: Record<SubscriptionTier, Plan> = SUBSCRIPTION_TIERS.reduce(
  (map, tier) => {
    map[tier] = buildPlan(tier)
    return map
  },
  {} as Record<SubscriptionTier, Plan>,
)

/** What a user with no subscription is shown. */
export const NO_SUBSCRIPTION: Plan = Object.freeze({
  tier: null,
  name: "No subscription",
  price: null,
  priceLabel: "—",
  features: [],
})

/**
 * Resolve the {@link Plan} for a tier, accepting the pre-rebrand aliases
 * (`foundation`, `pro`, `acceleration`, `intelligence`) that older
 * `identity.user_tiers` rows still carry.
 *
 * Returns {@link NO_SUBSCRIPTION} — never `undefined` — for `free`, for the
 * one-time `snapshot`/`blueprint` grants, and for any unknown value.
 */
export function getPlanDetails(tier: string | null | undefined): Plan {
  const canonical = toSubscriptionTier(tier)
  return canonical ? PLANS[canonical] : NO_SUBSCRIPTION
}

/**
 * Derive the wallet subscription-status label from the user's `is_subscribed`
 * flag (Requirement 9.3). Truthy → `"Active"`, otherwise → `"Inactive"`.
 */
export function deriveSubscriptionStatus(
  isSubscribed: boolean | undefined | null,
): "Active" | "Inactive" {
  return isSubscribed ? "Active" : "Inactive"
}
