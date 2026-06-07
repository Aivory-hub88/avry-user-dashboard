/**
 * Subscription plan catalog and pure helpers (server-safe, no `'use client'`).
 *
 * Extracted from `app/dashboard/subscriptions/page.tsx` and
 * `app/dashboard/wallet/page.tsx` so the type-fixed plan/status logic
 * (Requirements 9.3, 9.4) is a single source of truth and unit-testable without
 * rendering a client component. The shapes and values here are identical to the
 * inline definitions they replace.
 */

export interface Plan {
  name: string
  price: number
  features: string[]
}

export const PLANS: Record<string, Plan> = {
  free: {
    name: "Free",
    price: 0,
    features: ["100 credits/month", "3 workflows", "Basic support"],
  },
  snapshot: {
    name: "AI Snapshot",
    price: 29,
    features: ["500 credits", "10 workflows", "Priority support", "AI Snapshot report"],
  },
  blueprint: {
    name: "AI System Blueprint",
    price: 85,
    features: ["2000 credits", "50 workflows", "Priority support", "AI Blueprint report", "Workflow templates"],
  },
  enterprise: {
    name: "Enterprise",
    price: 499,
    features: ["50000 credits", "Unlimited workflows", "Dedicated support", "Custom integrations", "SLA"],
  },
}

/**
 * Resolve the {@link Plan} for a tier. Maps legacy tier aliases
 * (`foundation`/`acceleration`/`intelligence`) onto their plans and falls back
 * to `PLANS.free` for any unknown tier. Always returns a `Plan` (never
 * `undefined`).
 */
export function getPlanDetails(tier: string): Plan {
  const planMap: Record<string, Plan> = {
    foundation: PLANS.free,
    acceleration: PLANS.snapshot,
    intelligence: PLANS.blueprint,
    free: PLANS.free,
    snapshot: PLANS.snapshot,
    blueprint: PLANS.blueprint,
    enterprise: PLANS.enterprise,
  }
  return planMap[tier] ?? PLANS.free
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
