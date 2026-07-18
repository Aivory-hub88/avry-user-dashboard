"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { AuthManager } from "@/lib/authManager"
import { deriveSubscriptionStatus } from "@/lib/subscriptionPlans"
import LoadingState from "@/components/dashboard/LoadingState"
import ErrorState from "@/components/dashboard/ErrorState"
import styles from "@/app/dashboard/dashboard.module.css"

interface Quota {
  workflows: {
    used: number
    max: number
    percentage: number
  }
  executions: {
    used: number
    max: number
    percentage: number
  }
  storage: {
    used: number
    max: number
    percentage: number
  }
}

interface Payment {
  payment_id: string
  order_id: string
  user_id: string
  product: string
  amount: number
  status: string
  payment_method: string
  transaction_id: string | null
  created_at: string
  updated_at: string
}

interface WalletData {
  quota: Quota
  payments: Payment[]
  totalSpent: number
  subscriptionStatus: string
  tier: string
}

const formatNumber = (num: number) => {
  return new Intl.NumberFormat("en-US").format(num)
}

export default function WalletPage() {
  const t = useTranslations("dashboard")
  const [walletData, setWalletData] = useState<WalletData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

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
          setError("Please log in to view your wallet")
          setAuthLoading(false)
          return
        }
      }
      setAuthLoading(false)
    }

    checkAuth()
  }, [])

  useEffect(() => {
    if (authLoading) return

    fetchWalletData()
  }, [authLoading])

  const fetchWalletData = async () => {
    if (!AuthManager.isAuthenticated()) return

    setLoading(true)
    setError(null)

    try {
      const user = AuthManager.getUser()
      const tier = user?.tier || "free"

      // Define quota limits per tier
      const quotaLimits: Record<string, Quota> = {
        free: {
          workflows: { used: 2, max: 3, percentage: 67 },
          executions: { used: 45, max: 3000, percentage: 2 },
          storage: { used: 10, max: 100, percentage: 10 },
        },
        snapshot: {
          workflows: { used: 5, max: 10, percentage: 50 },
          executions: { used: 500, max: 15000, percentage: 3 },
          storage: { used: 25, max: 500, percentage: 5 },
        },
        blueprint: {
          workflows: { used: 8, max: 10, percentage: 80 },
          executions: { used: 12000, max: 15000, percentage: 80 },
          storage: { used: 100, max: 1000, percentage: 10 },
        },
        builder: {
          workflows: { used: 3, max: 3, percentage: 100 },
          executions: { used: 1500, max: 2500, percentage: 60 },
          storage: { used: 50, max: 500, percentage: 10 },
        },
        operator: {
          workflows: { used: 8, max: 10, percentage: 80 },
          executions: { used: 8000, max: 10000, percentage: 80 },
          storage: { used: 200, max: 2000, percentage: 10 },
        },
        enterprise: {
          workflows: { used: 50, max: 999999, percentage: 0 },
          executions: { used: 25000, max: 999999, percentage: 3 },
          storage: { used: 500, max: 10000, percentage: 5 },
        },
      }

      // Fetch payment history — only when a real user is signed in. The
      // legacy "GrandMasterRCH" fallback userId is retired; without a
      // user_id there is no history to fetch.
      const userId = user?.user_id

      let payments: Payment[] = []
      let totalSpent = 0

      if (userId) {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8081'}/api/v1/payments/history/${userId}`, {
          headers: {
            'Authorization': `Bearer ${AuthManager.getAccessToken()}`
          }
        })

        if (response.ok) {
          const data = await response.json()
          if (data.success && Array.isArray(data.payments)) {
            payments = data.payments
            totalSpent = payments.reduce((sum, p) => sum + (p.amount || 0), 0)
          }
        }
      }

      setWalletData({
        quota: quotaLimits[tier] || quotaLimits.free,
        payments,
        totalSpent,
        subscriptionStatus: deriveSubscriptionStatus(user?.is_subscribed),
        tier: tier,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wallet data")
    } finally {
      setLoading(false)
    }
  }

  const ProgressCard = ({ title, used, max, percentage, unit }: { title: string; used: number; max: number; percentage: number; unit: string }) => (
    <div className="rounded-xl border border-white/[0.07] bg-[#2a2a27] p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-white">{title}</h3>
        <span className="text-sm text-gray-400">
          {formatNumber(used)} / {formatNumber(max)} {unit}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-purple to-brand-mint"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="mt-2 text-right">
        <span className={`text-sm font-medium ${percentage >= 90 ? "text-red-400" : "text-gray-400"}`}>
          {percentage}% used
        </span>
      </div>
    </div>
  )

  if (authLoading) {
    return <LoadingState />
  }

  if (error && !walletData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <ErrorState message={error} onRetry={fetchWalletData} />
      </div>
    )
  }

  if (!walletData) {
    return <LoadingState />
  }

  return (
    <div className={`${styles.dashboardContainer} bg-bg-primary`}>
      {/* Full-width page title spanning both columns */}
      <h1 className={styles.pageTitle}>Your Wallet</h1>

      {/* Left column - Quota & Subscription */}
      <div className={styles.mainContent}>
        {/* Quota Card */}
        <div className="rounded-xl border border-white/[0.07] bg-[#2a2a27] p-6">
          <h2 className="text-lg font-medium text-white mb-4">Quota & Credits</h2>
          <div className="space-y-4">
            <ProgressCard
              title="Active Workflows"
              used={walletData.quota.workflows.used}
              max={walletData.quota.workflows.max}
              percentage={walletData.quota.workflows.percentage}
              unit="workflows"
            />
            <ProgressCard
              title="Monthly Executions"
              used={walletData.quota.executions.used}
              max={walletData.quota.executions.max}
              percentage={walletData.quota.executions.percentage}
              unit="executions"
            />
            <ProgressCard
              title="Storage"
              used={walletData.quota.storage.used}
              max={walletData.quota.storage.max}
              percentage={walletData.quota.storage.percentage}
              unit="MB"
            />
          </div>
        </div>

        {/* Subscription Card */}
        <div className="rounded-xl border border-white/[0.07] bg-[#2a2a27] p-6">
          <h2 className="text-lg font-medium text-white mb-4">Subscription Status</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-white/[0.05] rounded-lg">
              <span className="text-sm text-gray-400">Current Tier</span>
              <span className="text-sm font-medium text-brand-mint">
                {walletData.tier.charAt(0).toUpperCase() + walletData.tier.slice(1)}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-white/[0.05] rounded-lg">
              <span className="text-sm text-gray-400">Status</span>
              <span className={`text-sm font-medium ${walletData.subscriptionStatus === 'Active' ? 'text-brand-mint' : 'text-red-400'}`}>
                {walletData.subscriptionStatus}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-white/[0.05] rounded-lg">
              <span className="text-sm text-gray-400">Total Spent</span>
              <span className="text-sm font-medium text-white">${formatNumber(walletData.totalSpent)}</span>
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={() => alert("Manage subscription - coming soon")}
              className="w-full rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white hover:bg-brand-mint hover:text-bg-primary transition-colors"
            >
              Manage Subscription
            </button>
          </div>
        </div>
      </div>

      {/* Right column - Payment History & Usage */}
      <div className={styles.rightColumn}>
        {/* Payment History Card */}
        <div className="rounded-xl border border-white/[0.07] bg-[#2a2a27] p-6">
          <h2 className="text-lg font-medium text-white mb-4">Payment History</h2>
          <div className="space-y-3">
            {walletData.payments.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                No payment history yet
              </div>
            ) : (
              walletData.payments.map((payment) => (
                <div key={payment.payment_id || payment.order_id} className="flex justify-between items-center p-3 bg-white/[0.05] rounded-lg">
                  <div>
                    <div className="text-sm font-medium text-white">{payment.product}</div>
                    <div className="text-xs text-gray-400">
                      {new Date(payment.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-white">${formatNumber(payment.amount)}</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      payment.status === 'paid' ? 'bg-brand-mint/20 text-brand-mint' :
                      payment.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' :
                      'bg-red-500/20 text-red-500'
                    }`}>
                      {payment.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Usage Metrics Card */}
        <div className="rounded-xl border border-white/[0.07] bg-[#2a2a27] p-6">
          <h2 className="text-lg font-medium text-white mb-4">Usage Metrics</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-white/[0.05] rounded-lg text-center">
              <div className="text-2xl font-bold text-brand-mint">
                {walletData.quota.executions.used.toLocaleString()}
              </div>
              <div className="text-xs text-gray-400 mt-1">Executions</div>
            </div>
            <div className="p-4 bg-white/[0.05] rounded-lg text-center">
              <div className="text-2xl font-bold text-[#8B5CF6]">
                {walletData.quota.workflows.used.toLocaleString()}
              </div>
              <div className="text-xs text-gray-400 mt-1">Workflows</div>
            </div>
            <div className="p-4 bg-white/[0.05] rounded-lg text-center">
              <div className="text-2xl font-bold text-[#ffaa00]">
                ${formatNumber(walletData.totalSpent)}
              </div>
              <div className="text-xs text-gray-400 mt-1">Total Spent</div>
            </div>
            <div className="p-4 bg-white/[0.05] rounded-lg text-center">
              <div className="text-2xl font-bold text-brand-mint">
                {walletData.payments.filter(p => p.status === 'paid').length}
              </div>
              <div className="text-xs text-gray-400 mt-1">Transactions</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
