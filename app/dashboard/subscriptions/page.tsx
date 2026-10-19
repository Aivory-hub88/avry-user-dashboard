"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { AuthManager } from "@/lib/authManager"
import { PLANS, getPlanDetails, deriveSubscriptionStatus, planOffer, type Billing } from "@/lib/subscriptionPlans"
import { usePayment } from "@/hooks/usePayment"
import PromoCodeField from "@/components/payment/PromoCodeField"
import { getMarketingUrl } from "@/lib/config"
import { NOT_ACTIVATED_HINT, NOT_ACTIVATED_LABEL, isActivated, toSubscriptionTier } from "@/lib/tiers"
import LoadingState from "@/components/dashboard/LoadingState"
import ErrorState from "@/components/dashboard/ErrorState"
import styles from "@/app/dashboard/dashboard.module.css"

interface Subscription {
  plan: string
  status: string
  startDate: string
  endDate: string
  features: string[]
  price: number
}

export default function SubscriptionsPage() {
  const t = useTranslations("dashboard")
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [billing, setBilling] = useState<Billing>("monthly")
  const { handlePayment, paymentLoading, paymentError, promoCode, setPromoCode } = usePayment()

  useEffect(() => {
    const checkAuth = async () => {
      if (!window.AuthManagerReady) {
        await new Promise(resolve => {
          const checkInterval = setInterval(() => {
            if (window.AuthManagerReady) {
              clearInterval(checkInterval)
              resolve(true)
            }
          }, 50)
          setTimeout(() => {
            clearInterval(checkInterval)
            resolve(true)
          }, 5000)
        })
      }

      if (typeof AuthManager !== "undefined") {
        if (!AuthManager.isAuthenticated()) {
          setError("Please log in to view your subscription")
          setAuthLoading(false)
          return
        }

        const currentUser = AuthManager.getUser()
        setUser(currentUser)
      }
      setAuthLoading(false)
    }

    checkAuth()
  }, [])

  if (authLoading) {
    return <LoadingState />
  }

  if (error && !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <ErrorState message={error} onRetry={() => setAuthLoading(true)} />
      </div>
    )
  }

  const userTier = user?.tier || "free"
  const currentPlan = getPlanDetails(userTier)
  // Canonical form of the user's tier, so an older `foundation`/`pro` row is
  // recognised as the plan it actually is when filtering the upgrade list.
  const currentTier = toSubscriptionTier(userTier)
  // No free plan exists: without anything paid the account is "not activated".
  const activated = Boolean(currentTier) || isActivated(userTier, user?.account_type)

  return (
    <div className={`${styles.dashboardContainer} bg-bg-primary`}>
      <h1 className={styles.pageTitle}>Subscription</h1>

      <div className="space-y-6">
        {/* Current Plan Card */}
        <div className="rounded-xl border border-white/[0.07] bg-[#2a2a27] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-white">Current Plan</h2>
            <span className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium bg-accent/20 text-accent">
              {activated ? currentPlan.name : NOT_ACTIVATED_LABEL}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Price</p>
              <p className="text-2xl font-bold text-white">{currentPlan.priceLabel}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Status</p>
              {/* Was hardcoded "Active", which reported a subscription even for
                  an account that has never held one. */}
              <p className="text-lg font-medium text-white">
                {activated
                  ? deriveSubscriptionStatus(Boolean(currentTier) && user?.is_subscribed !== false)
                  : NOT_ACTIVATED_HINT}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/[0.07]">
            <h3 className="text-sm font-medium text-white mb-2">Features Included</h3>
            <ul className="space-y-2">
              {currentPlan.features.map((feature, index) => (
                <li key={index} className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="text-brand-mint">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Upgrade Options */}
        <div className="rounded-xl border border-white/[0.07] bg-[#2a2a27] p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium text-white">Upgrade Options</h2>
            {/* Same choice as the marketing site's Operating Plan: annual is
                twelve months paid up front at twelve monthly prices. */}
            <div
              role="radiogroup"
              aria-label="Billing period"
              className="inline-flex rounded-full border border-white/[0.1] p-1"
            >
              {(["monthly", "annual"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={billing === option}
                  onClick={() => setBilling(option)}
                  className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                    billing === option ? "bg-accent text-on-accent" : "text-gray-300 hover:bg-white/5"
                  }`}
                >
                  {option === "monthly" ? "Monthly" : "Annually"}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 max-w-md">
            <PromoCodeField
              value={promoCode}
              onChange={setPromoCode}
              products={Object.keys(PLANS)
                .map((tier) => planOffer(tier as keyof typeof PLANS, billing)?.productId)
                .filter((id): id is string => Boolean(id))}
              disabled={paymentLoading}
            />
          </div>

          {paymentError && (
            <div className="mb-4 rounded-lg border border-red-500/[0.3] bg-red-500/[0.1] p-3">
              <p className="text-sm text-red-300">{paymentError}</p>
            </div>
          )}

          <div className="grid gap-4">
            {/* The current plan stays listed on the annual view: moving a
                monthly plan to annual billing is a legitimate purchase. */}
            {Object.entries(PLANS)
              .filter(([key]) => billing === "annual" || key !== currentTier)
              .map(([key, plan]) => {
                const offer = planOffer(key as keyof typeof PLANS, billing)
                const isCurrent = key === currentTier
                return (
                  <div
                    key={key}
                    className="rounded-lg border border-white/[0.07] bg-[var(--bg-main)]/50 p-4 hover:bg-[var(--bg-main)] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-base font-medium text-white">{plan.name}</h3>
                        <p className="text-sm text-gray-400 mt-1">{offer ? offer.priceLabel : plan.priceLabel}</p>
                        {offer && <p className="text-xs text-gray-500 mt-0.5">{offer.billingNote}</p>}
                      </div>
                      {offer ? (
                        <button
                          onClick={() =>
                            handlePayment(
                              offer.productId,
                              offer.price,
                              `${plan.name} Plan${billing === "annual" ? " (Annual)" : ""}`,
                            )
                          }
                          disabled={paymentLoading}
                          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-btn-hover transition-colors disabled:opacity-50"
                        >
                          {paymentLoading ? "Processing..." : isCurrent ? "Switch to annual" : "Upgrade"}
                        </button>
                      ) : (
                        <a
                          href={`${getMarketingUrl()}/contact`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-white/[0.1] px-4 py-2 text-sm font-medium text-gray-200 hover:bg-white/5 transition-colors"
                        >
                          Contact Sales
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>

        {/* Payment Methods */}
        <div className="rounded-xl border border-white/[0.07] bg-[#2a2a27] p-6">
          <h2 className="text-lg font-medium text-white mb-4">Payment Methods</h2>
          <p className="text-sm text-gray-400">No payment methods added yet</p>
          <button
            onClick={() => alert("Add payment method - coming soon")}
            className="mt-2 rounded-lg border border-white/[0.07] px-4 py-2 text-sm text-gray-300 hover:bg-white/5 transition-colors"
          >
            Add Payment Method
          </button>
        </div>
      </div>
    </div>
  )
}
