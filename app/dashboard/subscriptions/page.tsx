"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { AuthManager } from "@/lib/authManager"
import { PLANS, getPlanDetails } from "@/lib/subscriptionPlans"
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

  return (
    <div className={`${styles.dashboardContainer} bg-bg-primary`}>
      <h1 className={styles.pageTitle}>Subscription</h1>

      <div className="space-y-6">
        {/* Current Plan Card */}
        <div className="rounded-xl border border-white/[0.07] bg-[#2a2a27] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-white">Current Plan</h2>
            <span className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium bg-brand-mint/20 text-brand-mint">
              {currentPlan.name}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Price</p>
              <p className="text-2xl font-bold text-white">${currentPlan.price}/month</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Status</p>
              <p className="text-lg font-medium text-white">Active</p>
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
          <h2 className="text-lg font-medium text-white mb-4">Upgrade Options</h2>

          <div className="grid gap-4">
            {Object.entries(PLANS).filter(([key]) => key !== userTier).map(([key, plan]) => (
              <div
                key={key}
                className="rounded-lg border border-white/[0.07] bg-[#353531]/50 p-4 hover:bg-[#353531] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-medium text-white">{plan.name}</h3>
                    <p className="text-sm text-gray-400 mt-1">${plan.price}/month</p>
                  </div>
                  <button
                    onClick={() => alert(`Upgrade to ${plan.name} - coming soon`)}
                    className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white hover:bg-brand-mint hover:text-bg-primary transition-colors"
                  >
                    Upgrade
                  </button>
                </div>
              </div>
            ))}
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
