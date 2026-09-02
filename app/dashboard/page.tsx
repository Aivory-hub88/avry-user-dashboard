"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { DashboardData, getPlaceholderData } from "@/types/dashboard"
import OverviewCard from "@/components/dashboard/OverviewCard"
import LifecycleCard from "@/components/dashboard/LifecycleCard"
import RecentActivity from "@/components/dashboard/RecentActivity"
import LoadingState from "@/components/dashboard/LoadingState"
import ErrorState from "@/components/dashboard/ErrorState"
import PaymentHistoryTab from "@/components/dashboard/PaymentHistoryTab"
import CreditPurchaseTab from "@/components/dashboard/CreditPurchaseTab"
import WalletSettings from "@/components/dashboard/WalletSettings"
import styles from "./dashboard.module.css"
import { useRouterContext } from '@/contexts/RouterContext'
import { ContinuedFromConsole } from '@/components/routing/ContinuedFromConsole'
import { AuthManager } from '@/lib/authManager'
import { SERVICES } from '@/config/services'
import { getMarketingUrl } from '@/lib/config'
import { usePayment } from '@/hooks/usePayment'
import { ActivateFeaturesSection } from '@/components/settings/ActivateFeaturesSection'
import {
  TIER_CREDIT_ALLOWANCE,
  TIER_DISPLAY_NAMES,
  TIER_MONTHLY_PRICE_USD,
  toSubscriptionTier,
  type SubscriptionTier,
} from '@/lib/tiers'

/**
 * Plan-card copy. Names, prices and credit allowances are NOT restated here —
 * they come from `lib/tiers.ts`, which mirrors the marketing site's pricing
 * catalogue and the backend's allowance table. Only the per-plan prose and
 * feature bullets live here.
 */
const SUBSCRIPTION_PLAN_CARDS: ReadonlyArray<{
  tier: SubscriptionTier
  blurb: string
  features: string[]
  /** Sold through sales, not self-serve checkout: no published price. */
  salesAssisted?: boolean
}> = [
  {
    tier: 'operational',
    blurb: 'For individuals and solo professionals starting their AI journey.',
    features: [
      'Aivory Agentic on-demand consultation',
      '3 active workflows',
      '5 JSON exports/month',
      'Deploy to n8n (optional)',
      '1 active agent',
      'Telegram or Slack',
    ],
  },
  {
    tier: 'business',
    blurb: 'For SMEs and founders running AI operations daily.',
    features: [
      'Aivory Agentic response',
      '10 active workflows',
      'Unlimited JSON exports',
      'Conditional logic & branching',
      '3 active agents',
      'Telegram & Slack',
      'Multi-step agent flows',
    ],
  },
  {
    tier: 'enterprise',
    blurb: 'For large organisations with advanced AI operations.',
    salesAssisted: true,
    features: [
      'Dedicated account manager',
      'Unlimited workflows',
      'Unlimited exports',
      'Advanced orchestration',
      'Unlimited agents',
      'Custom integrations',
      'SLA guarantee',
      'Multi-team workspace',
    ],
  },
]

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [authLoading, setAuthLoading] = useState(true)
  const [deepDiagnosticCompleted, setDeepDiagnosticCompleted] = useState(false)
  const [activeTab, setActiveTab] = useState('profile')
  const { handlePayment, paymentLoading, paymentError } = usePayment()
  const CONTACT_SALES_URL = `${getMarketingUrl()}/contact`
  const t = useTranslations("dashboard")

  const { pendingContext, clearPendingContext } = useRouterContext()
  const [routingNotice, setRoutingNotice] = useState<string | null>(null)
  const [showLoginModal, setShowLoginModal] = useState(false)

  // Declared before the effects that call it — called only inside a
  // useEffect body (deferred), so this was never an actual runtime hazard,
  // but ordering it this way satisfies static declaration-order analysis
  // too (e.g. if React Compiler is ever enabled for this app).
  const fetchDashboardData = async () => {
    try {
      // Fetch real wallet data for credit tab
      const userId = AuthManager.getUserId()
      if (userId) {
        try {
          const walletResponse = await fetch(
            `${SERVICES.PAYMENTS}/api/v1/wallet/${userId}`
          )
          if (walletResponse.ok) {
            const walletData = await walletResponse.json()
            // Store wallet data in localStorage for the CreditPurchaseTab component
            localStorage.setItem('aivory_wallet_data', JSON.stringify(walletData))
          }
        } catch (err) {
          console.error("Failed to fetch wallet data:", err)
        }
      }
    } catch (err) {
      console.error("Error in fetchDashboardData:", err)
    } finally {
      setData(getPlaceholderData())
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!pendingContext) return
    
    const maxAge = pendingContext.maxAge ?? 5 * 60 * 1000
    if (Date.now() - pendingContext.timestamp > maxAge) {
      clearPendingContext()
      return
    }
    
    if (pendingContext.targetRoute !== 'dashboard') return
    // Standard fetch-on-mount / sync-from-prop / hydrate-after-mount pattern
    // (functionally correct in this pre-Suspense/pre-React-Query codebase) —
    // not restructuring this component's data flow to satisfy the newer
    // React Compiler style rule; see other documented instances of this.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoutingNotice(pendingContext.aiReplySummary || pendingContext.triggerMessage)
    clearPendingContext()
  }, [pendingContext, clearPendingContext])

  useEffect(() => {
    fetchDashboardData()

    const deepContext = localStorage.getItem('aivory_diagnostic_context')
    if (deepContext) {
      // Standard fetch-on-mount / sync-from-prop / hydrate-after-mount pattern
      // (functionally correct in this pre-Suspense/pre-React-Query codebase) —
      // not restructuring this component's data flow to satisfy the newer
      // React Compiler style rule; see other documented instances of this.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDeepDiagnosticCompleted(true)
    }
  }, [])

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

      if (typeof AuthManager !== 'undefined') {
        if (!AuthManager.isAuthenticated()) {
          setShowLoginModal(true)
        }
      }
      setAuthLoading(false)
    }

    checkAuth()
  }, [])

  if (loading || authLoading) {
    return <LoadingState />
  }

  if (showLoginModal) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <div className="text-center">
          <h2 className="text-2xl font-light text-white mb-4">Please Log In</h2>
          <p className="text-white/60 mb-6">You must be logged in to access the dashboard</p>
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && typeof window.showLoginModal === 'function') {
                window.showLoginModal()
              }
            }}
            className="px-6 py-3 bg-brand-purple text-white font-medium rounded-lg hover:bg-brand-mint hover:text-bg-primary transition-colors"
          >
            Log In
          </button>
        </div>
      </div>
    )
  }

  if (!data) {
    return <ErrorState onRetry={fetchDashboardData} />
  }

  return (
    <div className={`${styles.dashboardContainer} bg-bg-primary`}>
      {/* Development Mode Banner */}
      <div className="bg-blue-500/[0.1] border border-blue-500/[0.3] p-3 rounded-lg mb-6" style={{ gridColumn: '1 / -1' }}>
        <p className="text-sm text-blue-300">
          <span className="font-semibold">🔧 Development Mode:</span> All payments are simulated (mock). Features will unlock immediately without real payment processing.
        </p>
      </div>

      {routingNotice !== null && (
        <ContinuedFromConsole summary={routingNotice} onDismiss={() => setRoutingNotice(null)} />
      )}

      {/* Tab Navigation */}
      <div className="grid grid-cols-5 gap-2 mb-6" style={{ gridColumn: '1 / -1' }}>
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'profile'
              ? 'bg-accent text-[#1a1a24]'
              : 'bg-white/[0.05] text-white hover:bg-white/[0.1]'
          }`}
        >
          Profile
        </button>
        <button
          onClick={() => setActiveTab('wallet')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'wallet'
              ? 'bg-accent text-[#1a1a24]'
              : 'bg-white/[0.05] text-white hover:bg-white/[0.1]'
          }`}
        >
          Wallet
        </button>
        <button
          onClick={() => setActiveTab('quota')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'quota'
              ? 'bg-accent text-[#1a1a24]'
              : 'bg-white/[0.05] text-white hover:bg-white/[0.1]'
          }`}
        >
          Credit
        </button>
        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'subscriptions'
              ? 'bg-accent text-[#1a1a24]'
              : 'bg-white/[0.05] text-white hover:bg-white/[0.1]'
          }`}
        >
          Subscriptions
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'payments'
              ? 'bg-accent text-[#1a1a24]'
              : 'bg-white/[0.05] text-white hover:bg-white/[0.1]'
          }`}
        >
          Payments
        </button>
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="col-span-2">
          <div className="rounded-xl border border-white/[0.07] bg-[#2a2a27] p-8">
            <h2 className="text-xl font-medium text-white mb-6">Profile</h2>
            <div className="space-y-6">
              {/* Avatar Section */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent to-[#00b87d] flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-semibold text-black">
                    {AuthManager.getUser()?.email?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-medium text-white">{AuthManager.getUser()?.email}</h3>
                  <p className="text-sm text-gray-400 mt-1">{AuthManager.getUser()?.company_name || 'No company name set'}</p>
                </div>
              </div>
              
              {/* Information Grid */}
              <div className="border-t border-white/[0.07] pt-6 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Account Type</span>
                  <span className="text-sm text-white capitalize">{AuthManager.getUser()?.account_type || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Tier</span>
                  <span className="text-sm text-accent font-medium">{AuthManager.getUser()?.tier?.toUpperCase() || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Subscription Status</span>
                  <span className={`text-sm font-medium ${AuthManager.getUser()?.is_subscribed ? 'text-accent' : 'text-gray-400'}`}>
                    {AuthManager.getUser()?.is_subscribed ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Credits Available</span>
                  <span className="text-sm text-white">{AuthManager.getUser()?.credits || 0}/{AuthManager.getUser()?.credits_max || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Tab */}
      {activeTab === 'wallet' && (
        <div className="col-span-2">
          <div className="rounded-xl border border-white/[0.07] bg-[#2a2a27] p-8">
            <h2 className="text-xl font-medium text-white mb-6">Wallet Settings</h2>
            <WalletSettings />
          </div>
        </div>
      )}

      {/* Credit Tab */}
      {activeTab === 'quota' && (
        <div className="col-span-2">
          <div className="rounded-xl border border-white/[0.07] bg-[#2a2a27] p-8">
            <h2 className="text-xl font-medium text-white mb-6">Credit</h2>
            <CreditPurchaseTab />
          </div>
        </div>
      )}

      {/* Subscriptions Tab */}
      {activeTab === 'subscriptions' && (
        <div className="col-span-2">
          <div className="rounded-xl border border-white/[0.07] bg-[#2a2a27] p-8">
            <h2 className="text-xl font-medium text-white mb-8">Subscriptions</h2>
            
            <div className="mb-12">
              <ActivateFeaturesSection />
            </div>

            {/* Error Message (subscription tier purchases below) */}
            {paymentError && (
              <div className="mb-6 rounded-lg bg-red-500/[0.1] border border-red-500/[0.3] p-4">
                <p className="text-sm text-red-300">{paymentError}</p>
              </div>
            )}

            {/* Recurring Subscription Plans Section */}
            <div className="border-t border-white/[0.07] pt-8">
              <h3 className="text-lg font-medium text-white mb-2">Subscription Plans</h3>
              <p className="text-sm text-gray-400 mb-6">Choose your plan for ongoing credits and features</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/*
                  Cards are rendered from SUBSCRIPTION_PLAN_CARDS rather than
                  hand-written three times over. The hand-written versions had
                  drifted badly: they advertised $20 and $44 for plans the
                  gateway charges $39 and $99 for (the amount posted from here
                  is discarded server-side, so the customer saw one figure and
                  was billed another), quoted credit allowances of 50/300/2,000
                  against a backend that grants 80/220/3,000, and the Enterprise
                  card's "Contact Sales" button in fact opened a $499 checkout.
                */}
                {SUBSCRIPTION_PLAN_CARDS.map((card) => {
                  const isCurrent = toSubscriptionTier(AuthManager.getUser()?.tier) === card.tier
                  const price = TIER_MONTHLY_PRICE_USD[card.tier] ?? null
                  return (
                    <div
                      key={card.tier}
                      className={`rounded-lg border p-6 transition-all flex flex-col ${isCurrent ? 'border-accent bg-white/[0.03]' : 'border-white/[0.07] bg-white/[0.01] hover:border-white/[0.1]'}`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-lg font-medium text-white">{TIER_DISPLAY_NAMES[card.tier]}</h3>
                        {isCurrent && <span className="text-xs font-medium px-2 py-1 bg-accent text-black rounded">Active</span>}
                      </div>
                      <p className="text-sm text-gray-400 mb-4">{card.blurb}</p>
                      <div className="mb-6">
                        {price === null ? (
                          <span className="text-3xl font-bold text-white">Custom</span>
                        ) : (
                          <>
                            <span className="text-3xl font-bold text-white">${price}</span>
                            <span className="text-sm text-gray-400">/month</span>
                          </>
                        )}
                      </div>
                      <ul className="space-y-2 text-sm text-gray-300 mb-6 flex-grow">
                        <li>✓ {TIER_CREDIT_ALLOWANCE[card.tier].toLocaleString('en-GB')} IC/month</li>
                        {card.features.map((feature) => (
                          <li key={feature}>✓ {feature}</li>
                        ))}
                      </ul>
                      {card.salesAssisted ? (
                        <a
                          href={CONTACT_SALES_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-3 rounded-lg font-medium transition-colors mt-auto bg-accent text-black hover:bg-[#00d489] text-center"
                        >
                          Contact Sales
                        </a>
                      ) : (
                        <button
                          className={`w-full py-3 rounded-lg font-medium transition-colors mt-auto ${isCurrent ? 'bg-white/[0.05] text-gray-400 cursor-default' : paymentLoading ? 'bg-white/[0.1] text-white/60' : 'bg-accent text-black hover:bg-[#00d489]'}`}
                          onClick={() => !isCurrent && handlePayment(card.tier, price ?? 0, `${TIER_DISPLAY_NAMES[card.tier]} Plan`)}
                          disabled={paymentLoading || isCurrent}
                        >
                          {paymentLoading ? 'Processing...' : isCurrent ? 'Current Plan' : `Start With ${TIER_DISPLAY_NAMES[card.tier]}`}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              {/* Custom Plan Section */}
              <div className="mt-8 pt-8 border-t border-white/[0.07]">
                <h3 className="text-lg font-medium text-white mb-4">Need Something Different?</h3>
                <p className="text-sm text-gray-400 mb-6">Create a custom plan tailored to your specific business needs. Our team will work with you to design the perfect solution.</p>
                <a href={`${getMarketingUrl()}/contact`} target="_blank" rel="noopener noreferrer" className="inline-block px-6 py-3 bg-white/[0.05] text-white font-medium rounded-lg hover:bg-white/[0.1] transition-colors">
                  Contact Us
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        <div className="col-span-2">
          <div className="rounded-xl border border-white/[0.07] bg-[#2a2a27] p-8">
            <h2 className="text-xl font-medium text-white mb-6">Payments</h2>
            <PaymentHistoryTab />
          </div>
        </div>
      )}
    </div>
  )
}
