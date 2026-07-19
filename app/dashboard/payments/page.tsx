"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { AuthManager } from "@/lib/authManager"
import LoadingState from "@/components/dashboard/LoadingState"
import ErrorState from "@/components/dashboard/ErrorState"
import styles from "@/app/dashboard/dashboard.module.css"
import { asset } from '@/lib/asset'

interface Payment {
  paymentId: string
  orderId: string
  product: string
  amount: number
  status: string
  paymentMethod: string
  createdAt: string
}

export default function PaymentsPage() {
  const t = useTranslations("dashboard")
  const [payments, setPayments] = useState<Payment[]>([])
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
          setError("Please log in to view your payments")
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

    fetchPayments()
  }, [authLoading])

  const fetchPayments = async () => {
    if (!AuthManager.isAuthenticated()) return

    setLoading(true)
    setError(null)

    try {
      const userId = AuthManager.getUserId()
      if (!userId) {
        throw new Error("User ID not found")
      }

      const token = AuthManager.getAccessToken()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(asset(`/api/payments/history/${userId}`), {
        method: 'GET',
        headers,
      })
      if (!response.ok) {
        throw new Error(`Failed to fetch payments (${response.status})`)
      }

      const data = await response.json()
      setPayments(data.payments || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments")
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-brand-mint/20 text-brand-mint"
      case "failed":
        return "bg-red-500/20 text-red-400"
      case "refunded":
        return "bg-gray-500/20 text-gray-400"
      case "pending":
        return "bg-yellow-500/20 text-yellow-400"
      default:
        return "bg-white/10 text-gray-300"
    }
  }

  const getStatusLabel = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  const getProductName = (product: string) => {
    const names: Record<string, string> = {
      ai_snapshot: "AI Snapshot",
      ai_blueprint: "AI System Blueprint",
      subscription: "Subscription",
      credits: "Credits",
    }
    return names[product] || product.replace("ai_", "")
  }

  if (authLoading) {
    return <LoadingState />
  }

  if (error && !payments.length) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <ErrorState message={error} onRetry={fetchPayments} />
      </div>
    )
  }

  return (
    <div className={`${styles.dashboardContainer} bg-bg-primary`}>
      <h1 className={styles.pageTitle}>Payment History</h1>

      {loading ? (
        <LoadingState />
      ) : (
        <div className="space-y-4">
          {payments.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-white/60">No payments found</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {payments.map((payment) => (
                <div
                  key={payment.paymentId}
                  className="rounded-xl border border-white/[0.07] bg-[#2a2a27] p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-medium text-white">
                          {getProductName(payment.product)}
                        </h3>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(
                            payment.status
                          )}`}
                        >
                          {getStatusLabel(payment.status)}
                        </span>
                      </div>

                      <div className="space-y-1 text-sm text-gray-400">
                        <p>
                          <span className="text-gray-500">Order ID:</span> {payment.orderId}
                        </p>
                        <p>
                          <span className="text-gray-500">Payment Method:</span> {payment.paymentMethod}
                        </p>
                        <p>
                          <span className="text-gray-500">Date:</span> {new Date(payment.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-2xl font-bold text-white">
                        ${payment.amount.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-center pt-6">
            <button
              onClick={fetchPayments}
              className="rounded-lg border border-white/[0.07] px-6 py-2 text-sm text-gray-300 hover:bg-white/5 transition-colors"
            >
              Refresh Payments
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
