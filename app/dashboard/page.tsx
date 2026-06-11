"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { DashboardData, getPlaceholderData } from "@/types/dashboard"
import { FreeDiagnosticService } from "@/services/freeDiagnostic"
import { DeepDiagnosticService } from "@/services/deepDiagnostic"
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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [authLoading, setAuthLoading] = useState(true)
  const [freeDiagnosticScore, setFreeDiagnosticScore] = useState<number | null>(null)
  const [freeDiagnosticCompleted, setFreeDiagnosticCompleted] = useState(false)
  const [deepDiagnosticCompleted, setDeepDiagnosticCompleted] = useState(false)
  const [activeTab, setActiveTab] = useState('profile')
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const t = useTranslations("dashboard")

  const { pendingContext, clearPendingContext } = useRouterContext()
  const [routingNotice, setRoutingNotice] = useState<string | null>(null)
  const [showLoginModal, setShowLoginModal] = useState(false)

  useEffect(() => {
    if (!pendingContext) return
    
    const maxAge = pendingContext.maxAge ?? 5 * 60 * 1000
    if (Date.now() - pendingContext.timestamp > maxAge) {
      clearPendingContext()
      return
    }
    
    if (pendingContext.targetRoute !== 'dashboard') return
    setRoutingNotice(pendingContext.aiReplySummary || pendingContext.triggerMessage)
    clearPendingContext()
  }, [pendingContext, clearPendingContext])

  useEffect(() => {
    fetchDashboardData()

    const result = FreeDiagnosticService.getResult()
    if (result) {
      setFreeDiagnosticCompleted(true)
      setFreeDiagnosticScore(result.score)
    }

    const deepContext = localStorage.getItem('aivory_diagnostic_context')
    if (deepContext) {
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

  const loadMidtransScript = async () => {
    return new Promise<boolean>((resolve) => {
      if ((window as any).snap) {
        resolve(true)
        return
      }

      const script = document.createElement("script")
      script.src = "https://app.sandbox.midtrans.com/snap/snap.js"
      script.setAttribute(
        "data-client-key",
        process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || ""
      )
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }

  const handlePayment = async (
    product: string,
    amount: number,
    productName: string
  ) => {
    try {
      setPaymentLoading(true)
      setPaymentError(null)

      const user = AuthManager.getUser()
      if (!user?.email) {
        throw new Error("User not authenticated")
      }

      const userId = AuthManager.getUserId()
      if (!userId) {
        throw new Error("User not authenticated")
      }

      // For subscriptions and one-time purchases, check wallet balance
      // Only wallet topups go through Midtrans
      const isSubscription = ['foundation', 'acceleration', 'intelligence'].includes(product)
      const isOneTimePurchase = product.startsWith('ai_')

      if (isSubscription || isOneTimePurchase) {
        // These now process through payment gateway (Midtrans or mock)
        // Create transaction on backend
        const response = await fetch(
          `${SERVICES.PAYMENTS}/api/v1/payments/midtrans/create`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              user_id: userId,
              amount: amount,
              product: product,
              customer_email: user.email,
              customer_first_name: user.company_name || "Customer",
              custom_field1: `Purchase: ${productName}`,
              custom_field2: `User: ${user.email}`,
            }),
          }
        )

        if (!response.ok) {
          throw new Error(`Backend error: ${response.status}`)
        }

        const data = await response.json()

        if (!data.success) {
          throw new Error(data.error || "Failed to create payment transaction")
        }

        if (!data.token) {
          throw new Error("Payment gateway returned no token")
        }

        // Check if using mock token (for development)
        if (data.token && data.token.startsWith("mock_token_")) {
          // Simulate immediate payment success for mock mode
          await simulatePaymentSuccess(data.order_id, userId, product, amount, productName)
          return
        }

        // Load Midtrans snap script for real payments
        const scriptLoaded = await loadMidtransScript()
        if (!scriptLoaded || !(window as any).snap) {
          throw new Error("Failed to load payment gateway")
        }

        // Open Midtrans payment modal
        ;(window as any).snap.pay(data.token, {
          onSuccess: async () => {
            await confirmPaymentSuccess(data.order_id, userId, product, amount, productName)
          },
          onPending: () => {
            setPaymentError("Payment pending. Please complete the process.")
          },
          onError: () => {
            setPaymentError("Payment failed. Please try again.")
          },
          onClose: () => {
            setPaymentError("Payment cancelled.")
          },
        })
      } else if (product.startsWith('credits_')) {
        // Credit purchases go through Midtrans
        const response = await fetch(
          `${SERVICES.PAYMENTS}/api/v1/payments/midtrans/create`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              user_id: userId,
              amount: amount,
              product: product,
              customer_email: user.email,
              customer_first_name: user.company_name || "Customer",
              custom_field1: `Purchase: ${productName}`,
              custom_field2: `User: ${user.email}`,
            }),
          }
        )

        if (!response.ok) {
          throw new Error(`Backend error: ${response.status}`)
        }

        const data = await response.json()

        if (!data.success) {
          throw new Error(data.error || "Failed to create payment transaction")
        }

        // Check for mock token
        if (data.token && data.token.startsWith("mock_token_")) {
          await simulatePaymentSuccess(data.order_id, userId, product, amount, productName)
          return
        }

        const scriptLoaded = await loadMidtransScript()
        if (!scriptLoaded || !(window as any).snap) {
          throw new Error("Failed to load payment gateway")
        }

        ;(window as any).snap.pay(data.token, {
          onSuccess: async () => {
            await confirmPaymentSuccess(data.order_id, userId, product, amount, productName)
          },
          onPending: () => {
            setPaymentError("Payment pending.")
          },
          onError: () => {
            setPaymentError("Payment failed. Please try again.")
          },
          onClose: () => {
            setPaymentError("Payment cancelled.")
          },
        })
      } else {
        throw new Error("Unknown product type")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred"
      setPaymentError(message)
      console.error("Payment error:", err)
    } finally {
      setPaymentLoading(false)
    }
  }

  const simulatePaymentSuccess = async (
    orderId: string,
    userId: string,
    product: string,
    amount: number,
    productName: string
  ) => {
    try {
      // Call confirm endpoint to process purchase with mock flag
      const confirmResponse = await fetch(
        `${SERVICES.PAYMENTS}/api/v1/payments/confirm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            order_id: orderId,
            user_id: userId,
            product: product,
            amount: amount,
            is_mock: true,  // Flag as mock payment
          }),
        }
      )

      if (confirmResponse.ok) {
        setPaymentError(null)
        alert(`✓ MOCK PAYMENT - Successfully purchased ${productName}!\n\n(This is a development simulation)`)
        // Reload to get updated user data
        window.location.reload()
      } else {
        setPaymentError("Payment confirmed but failed to process purchase")
      }
    } catch (err) {
      console.error("Error simulating payment success:", err)
      setPaymentError("Payment succeeded but couldn't update account")
    }
  }

  const confirmPaymentSuccess = async (
    orderId: string,
    userId: string,
    product: string,
    amount: number,
    productName: string
  ) => {
    try {
      const confirmResponse = await fetch(
        `${SERVICES.PAYMENTS}/api/v1/payments/confirm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            order_id: orderId,
            user_id: userId,
            product: product,
            amount: amount,
            is_mock: false,  // Real payment
          }),
        }
      )

      if (confirmResponse.ok) {
        setPaymentError(null)
        alert(`Successfully purchased ${productName}!`)
        window.location.reload()
      } else {
        setPaymentError("Payment confirmed but failed to process purchase")
      }
    } catch (err) {
      console.error("Error confirming payment:", err)
      setPaymentError("Payment succeeded but couldn't update account")
    }
  }

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
              ? 'bg-[#b7cba6] text-[#1a1a24]'
              : 'bg-white/[0.05] text-white hover:bg-white/[0.1]'
          }`}
        >
          Profile
        </button>
        <button
          onClick={() => setActiveTab('wallet')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'wallet'
              ? 'bg-[#b7cba6] text-[#1a1a24]'
              : 'bg-white/[0.05] text-white hover:bg-white/[0.1]'
          }`}
        >
          Wallet
        </button>
        <button
          onClick={() => setActiveTab('quota')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'quota'
              ? 'bg-[#b7cba6] text-[#1a1a24]'
              : 'bg-white/[0.05] text-white hover:bg-white/[0.1]'
          }`}
        >
          Credit
        </button>
        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'subscriptions'
              ? 'bg-[#b7cba6] text-[#1a1a24]'
              : 'bg-white/[0.05] text-white hover:bg-white/[0.1]'
          }`}
        >
          Subscriptions
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'payments'
              ? 'bg-[#b7cba6] text-[#1a1a24]'
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
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#b7cba6] to-[#00b87d] flex items-center justify-center flex-shrink-0">
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
                  <span className="text-sm text-[#b7cba6] font-medium">{AuthManager.getUser()?.tier?.toUpperCase() || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Subscription Status</span>
                  <span className={`text-sm font-medium ${AuthManager.getUser()?.is_subscribed ? 'text-[#b7cba6]' : 'text-gray-400'}`}>
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
            
            {/* Error Message */}
            {paymentError && (
              <div className="mb-6 rounded-lg bg-red-500/[0.1] border border-red-500/[0.3] p-4">
                <p className="text-sm text-red-300">{paymentError}</p>
              </div>
            )}
            
            {/* One-Time Feature Purchases Section */}
            <div className="mb-12">
              <h3 className="text-lg font-medium text-white mb-2">Activate Features</h3>
              <p className="text-sm text-gray-400 mb-6">One-time purchases to unlock premium features and enable specific tabs</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* AI Readiness Deep Diagnostic */}
                <div className={`rounded-lg border p-6 transition-all flex flex-col ${AuthManager.getUser()?.has_diagnostic ? 'border-[#b7cba6] bg-white/[0.03]' : 'border-white/[0.07] bg-white/[0.01] hover:border-white/[0.1]'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-medium text-white">AI Readiness Deep Diagnostic</h3>
                    {AuthManager.getUser()?.has_diagnostic && <span className="text-xs font-medium px-2 py-1 bg-[#b7cba6] text-black rounded">Active</span>}
                  </div>
                  <p className="text-sm text-gray-400 mb-4">Know exactly where your business stands on AI before you build anything.</p>
                  <div className="mb-6">
                    <span className="text-3xl font-bold text-white">$29</span>
                    <span className="text-sm text-gray-400">/one time</span>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-300 mb-6 flex-grow">
                    <li>✓ AI readiness score</li>
                    <li>✓ Business objective mapping</li>
                    <li>✓ Gap & constraint analysis</li>
                    <li>✓ AI opportunity identification</li>
                    <li>✓ Data & process readiness</li>
                  </ul>
                  <button className={`w-full py-3 rounded-lg font-medium transition-colors mt-auto ${AuthManager.getUser()?.has_diagnostic ? 'bg-white/[0.05] text-gray-400 cursor-default' : paymentLoading ? 'bg-white/[0.1] text-white/60' : 'bg-[#b7cba6] text-black hover:bg-[#00d489]'}`} onClick={() => !AuthManager.getUser()?.has_diagnostic && handlePayment('ai_diagnostic', 29, 'AI Readiness Deep Diagnostic')} disabled={paymentLoading || AuthManager.getUser()?.has_diagnostic}>
                    {paymentLoading ? 'Processing...' : AuthManager.getUser()?.has_diagnostic ? 'Tab Unlocked' : 'Activate'}
                  </button>
                </div>

                {/* AI System Blueprint + Roadmap */}
                <div className={`rounded-lg border p-6 transition-all flex flex-col ${AuthManager.getUser()?.has_blueprint ? 'border-[#b7cba6] bg-white/[0.03]' : 'border-white/[0.07] bg-white/[0.01] hover:border-white/[0.1]'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-medium text-white">AI System Blueprint + Roadmap</h3>
                    {AuthManager.getUser()?.has_blueprint && <span className="text-xs font-medium px-2 py-1 bg-[#b7cba6] text-black rounded">Active</span>}
                  </div>
                  <p className="text-sm text-gray-400 mb-4">Your full AI architecture and execution plan, built around your business, not a template.</p>
                  <div className="mb-6">
                    <span className="text-3xl font-bold text-white">$85</span>
                    <span className="text-sm text-gray-400">/one time</span>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-300 mb-6 flex-grow">
                    <li>✓ Full AI system blueprint</li>
                    <li>✓ Workflow architecture</li>
                    <li>✓ Agent structure design</li>
                    <li>✓ Deployment-ready plan</li>
                    <li>✓ Phased implementation roadmap</li>
                    <li>✓ KPI targets per phase</li>
                  </ul>
                  <button className={`w-full py-3 rounded-lg font-medium transition-colors mt-auto ${AuthManager.getUser()?.has_blueprint ? 'bg-white/[0.05] text-gray-400 cursor-default' : paymentLoading ? 'bg-white/[0.1] text-white/60' : 'bg-[#b7cba6] text-black hover:bg-[#00d489]'}`} onClick={() => !AuthManager.getUser()?.has_blueprint && handlePayment('ai_blueprint', 85, 'AI System Blueprint + Roadmap')} disabled={paymentLoading || AuthManager.getUser()?.has_blueprint}>
                    {paymentLoading ? 'Processing...' : AuthManager.getUser()?.has_blueprint ? 'Tab Unlocked' : 'Activate'}
                  </button>
                </div>

                {/* Full Stack Bundle */}
                <div className={`rounded-lg border p-6 transition-all flex flex-col ${(AuthManager.getUser()?.has_diagnostic && AuthManager.getUser()?.has_blueprint) ? 'border-[#b7cba6] bg-white/[0.03]' : 'border-white/[0.07] bg-white/[0.01] hover:border-white/[0.1]'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-medium text-white">Full Stack Bundle</h3>
                    {(AuthManager.getUser()?.has_diagnostic && AuthManager.getUser()?.has_blueprint) && <span className="text-xs font-medium px-2 py-1 bg-[#b7cba6] text-black rounded">Active</span>}
                  </div>
                  <p className="text-sm text-gray-400 mb-4">Everything in one. Know, plan, execute in order.</p>
                  <div className="mb-6">
                    <span className="text-3xl font-bold text-white">$99</span>
                    <span className="text-sm text-gray-400">/one time</span>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-300 mb-6 flex-grow">
                    <li>✓ Deep Diagnostic</li>
                    <li>✓ Blueprint</li>
                    <li>✓ Roadmap</li>
                    <li className="text-[#b7cba6] font-medium">✓ Save $15 vs buying separately</li>
                  </ul>
                  <button className={`w-full py-3 rounded-lg font-medium transition-colors mt-auto ${(AuthManager.getUser()?.has_diagnostic && AuthManager.getUser()?.has_blueprint) ? 'bg-white/[0.05] text-gray-400 cursor-default' : paymentLoading ? 'bg-white/[0.1] text-white/60' : 'bg-[#b7cba6] text-black hover:bg-[#00d489]'}`} onClick={() => !(AuthManager.getUser()?.has_diagnostic && AuthManager.getUser()?.has_blueprint) && handlePayment('ai_fullstack', 99, 'Full Stack Bundle')} disabled={paymentLoading || (AuthManager.getUser()?.has_diagnostic && AuthManager.getUser()?.has_blueprint)}>
                    {paymentLoading ? 'Processing...' : (AuthManager.getUser()?.has_diagnostic && AuthManager.getUser()?.has_blueprint) ? 'All Tabs Unlocked' : 'Activate Bundle'}
                  </button>
                </div>
              </div>
            </div>

            {/* Recurring Subscription Plans Section */}
            <div className="border-t border-white/[0.07] pt-8">
              <h3 className="text-lg font-medium text-white mb-2">Subscription Plans</h3>
              <p className="text-sm text-gray-400 mb-6">Choose your plan for ongoing credits and features</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Foundation */}
                <div className={`rounded-lg border p-6 transition-all flex flex-col ${AuthManager.getUser()?.tier === 'foundation' ? 'border-[#b7cba6] bg-white/[0.03]' : 'border-white/[0.07] bg-white/[0.01] hover:border-white/[0.1]'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-medium text-white">Foundation</h3>
                    {AuthManager.getUser()?.tier === 'foundation' && <span className="text-xs font-medium px-2 py-1 bg-[#b7cba6] text-black rounded">Active</span>}
                  </div>
                  <p className="text-sm text-gray-400 mb-4">For individuals and solo professionals starting their AI journey.</p>
                  <div className="mb-6">
                    <span className="text-3xl font-bold text-white">$20</span>
                    <span className="text-sm text-gray-400">/month</span>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-300 mb-6 flex-grow">
                    <li>✓ 50 IC/month</li>
                    <li>✓ Aivory Agentic on-demand consultation</li>
                    <li>✓ 3 active workflows</li>
                    <li>✓ 5 JSON exports/month</li>
                    <li>✓ Deploy to n8n (optional)</li>
                    <li>✓ 1 active agent</li>
                    <li>✓ Telegram or Slack</li>
                  </ul>
                  <button className={`w-full py-3 rounded-lg font-medium transition-colors mt-auto ${AuthManager.getUser()?.tier === 'foundation' ? 'bg-white/[0.05] text-gray-400 cursor-default' : paymentLoading ? 'bg-white/[0.1] text-white/60' : 'bg-[#b7cba6] text-black hover:bg-[#00d489]'}`} onClick={() => AuthManager.getUser()?.tier !== 'foundation' && handlePayment('foundation', 20, 'Foundation Plan')} disabled={paymentLoading || AuthManager.getUser()?.tier === 'foundation'}>
                    {paymentLoading ? 'Processing...' : AuthManager.getUser()?.tier === 'foundation' ? 'Current Plan' : 'Start With Foundation'}
                  </button>
                </div>

                {/* Pro */}
                <div className={`rounded-lg border p-6 transition-all flex flex-col ${AuthManager.getUser()?.tier === 'acceleration' ? 'border-[#b7cba6] bg-white/[0.03]' : 'border-white/[0.07] bg-white/[0.01] hover:border-white/[0.1]'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-medium text-white">Pro</h3>
                    {AuthManager.getUser()?.tier === 'acceleration' && <span className="text-xs font-medium px-2 py-1 bg-[#b7cba6] text-black rounded">Active</span>}
                  </div>
                  <p className="text-sm text-gray-400 mb-4">For SMEs and founders running AI operations daily.</p>
                  <div className="mb-6">
                    <span className="text-3xl font-bold text-white">$44</span>
                    <span className="text-sm text-gray-400">/month</span>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-300 mb-6 flex-grow">
                    <li>✓ 300 IC/month</li>
                    <li>✓ Aivory Agentic response</li>
                    <li>✓ 10 active workflows</li>
                    <li>✓ Unlimited JSON exports</li>
                    <li>✓ Conditional logic & branching</li>
                    <li>✓ 3 active agents</li>
                    <li>✓ Telegram & Slack</li>
                    <li>✓ Multi-step agent flows</li>
                  </ul>
                  <button className={`w-full py-3 rounded-lg font-medium transition-colors mt-auto ${AuthManager.getUser()?.tier === 'acceleration' ? 'bg-white/[0.05] text-gray-400 cursor-default' : paymentLoading ? 'bg-white/[0.1] text-white/60' : 'bg-[#b7cba6] text-black hover:bg-[#00d489]'}`} onClick={() => AuthManager.getUser()?.tier !== 'acceleration' && handlePayment('acceleration', 44, 'Pro Plan')} disabled={paymentLoading || AuthManager.getUser()?.tier === 'acceleration'}>
                    {paymentLoading ? 'Processing...' : AuthManager.getUser()?.tier === 'acceleration' ? 'Current Plan' : 'Start With Pro'}
                  </button>
                </div>

                {/* Enterprise */}
                <div className={`rounded-lg border p-6 transition-all flex flex-col ${AuthManager.getUser()?.tier === 'intelligence' ? 'border-[#b7cba6] bg-white/[0.03]' : 'border-white/[0.07] bg-white/[0.01] hover:border-white/[0.1]'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-medium text-white">Enterprise</h3>
                    {AuthManager.getUser()?.tier === 'intelligence' && <span className="text-xs font-medium px-2 py-1 bg-[#b7cba6] text-black rounded">Active</span>}
                  </div>
                  <p className="text-sm text-gray-400 mb-4">For large organizations with advanced AI operations.</p>
                  <div className="mb-6">
                    <span className="text-3xl font-bold text-white">$499</span>
                    <span className="text-sm text-gray-400">/month</span>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-300 mb-6 flex-grow">
                    <li>✓ 2,000 IC/month</li>
                    <li>✓ Dedicated account manager</li>
                    <li>✓ Unlimited workflows</li>
                    <li>✓ Unlimited exports</li>
                    <li>✓ Advanced orchestration</li>
                    <li>✓ Unlimited agents</li>
                    <li>✓ Custom integrations</li>
                    <li>✓ SLA guarantee</li>
                    <li>✓ Multi-team workspace</li>
                  </ul>
                  <button className={`w-full py-3 rounded-lg font-medium transition-colors mt-auto ${AuthManager.getUser()?.tier === 'intelligence' ? 'bg-white/[0.05] text-gray-400 cursor-default' : paymentLoading ? 'bg-white/[0.1] text-white/60' : 'bg-[#b7cba6] text-black hover:bg-[#00d489]'}`} onClick={() => AuthManager.getUser()?.tier !== 'intelligence' && handlePayment('intelligence', 499, 'Enterprise Plan')} disabled={paymentLoading || AuthManager.getUser()?.tier === 'intelligence'}>
                    {paymentLoading ? 'Processing...' : AuthManager.getUser()?.tier === 'intelligence' ? 'Current Plan' : 'Contact Sales'}
                  </button>
                </div>
              </div>
              {/* Custom Plan Section */}
              <div className="mt-8 pt-8 border-t border-white/[0.07]">
                <h3 className="text-lg font-medium text-white mb-4">Need Something Different?</h3>
                <p className="text-sm text-gray-400 mb-6">Create a custom plan tailored to your specific business needs. Our team will work with you to design the perfect solution.</p>
                <a href="http://localhost:9000/contact" target="_blank" rel="noopener noreferrer" className="inline-block px-6 py-3 bg-white/[0.05] text-white font-medium rounded-lg hover:bg-white/[0.1] transition-colors">
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
