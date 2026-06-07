"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { AuthManager } from "@/lib/authManager"
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

const formatNumber = (num: number) => {
  return new Intl.NumberFormat("en-US").format(num)
}

export default function QuotaPage() {
  const t = useTranslations("dashboard")
  const [quota, setQuota] = useState<Quota | null>(null)
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
          setError("Please log in to view your quota")
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

    fetchQuota()
  }, [authLoading])

  const fetchQuota = async () => {
    if (!AuthManager.isAuthenticated()) return

    setLoading(true)
    setError(null)

    try {
      // Mock quota data - in production, fetch from backend
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
        enterprise: {
          workflows: { used: 50, max: 999999, percentage: 0 },
          executions: { used: 25000, max: 999999, percentage: 3 },
          storage: { used: 500, max: 10000, percentage: 5 },
        },
      }

      setQuota(quotaLimits[tier] || quotaLimits.free)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quota")
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

  if (error && !quota) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <ErrorState message={error} onRetry={fetchQuota} />
      </div>
    )
  }

  return (
    <div className={`${styles.dashboardContainer} bg-bg-primary`}>
      <h1 className={styles.pageTitle}>Quota Management</h1>

      {loading ? (
        <LoadingState />
      ) : quota ? (
        <div className="space-y-4">
          <div className="grid gap-4">
            <ProgressCard
              title="Active Workflows"
              used={quota.workflows.used}
              max={quota.workflows.max}
              percentage={quota.workflows.percentage}
              unit="workflows"
            />
            <ProgressCard
              title="Monthly Executions"
              used={quota.executions.used}
              max={quota.executions.max}
              percentage={quota.executions.percentage}
              unit="executions"
            />
            <ProgressCard
              title="Storage"
              used={quota.storage.used}
              max={quota.storage.max}
              percentage={quota.storage.percentage}
              unit="MB"
            />
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-[#2a2a27] p-6">
            <h2 className="text-lg font-medium text-white mb-4">Upgrade for More Quota</h2>
            <p className="text-sm text-gray-400 mb-4">
              Upgrade your subscription to get more workflows, executions, and storage.
            </p>
            <button
              onClick={() => alert("Upgrade - coming soon")}
              className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white hover:bg-brand-mint hover:text-bg-primary transition-colors"
            >
              View Upgrade Options
            </button>
          </div>
        </div>
      ) : (
        <ErrorState message="Failed to load quota" onRetry={fetchQuota} />
      )}
    </div>
  )
}
