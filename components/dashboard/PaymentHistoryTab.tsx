"use client"

import { useState, useEffect } from "react"
import { AuthManager } from "@/lib/authManager"
import { SERVICES } from "@/config/services"

interface Payment {
  paymentId: string
  orderId: string
  product: string
  amount: number
  status: string
  paymentMethod: string
  createdAt: string
  is_mock?: boolean
}

export default function PaymentHistoryTab() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Declared before the effect that calls it (deferred execution, so this
  // was never an actual runtime hazard — but this ordering also satisfies
  // static declaration-order analysis).
  const fetchPayments = async () => {
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

      const response = await fetch(`${SERVICES.PAYMENTS}/api/v1/payments/history/${userId}`, {
        method: 'GET',
        headers,
      })
      
      if (!response.ok) {
        throw new Error(`Failed to fetch payments (${response.status})`)
      }

      const data = await response.json()
      
      // Handle different response formats
      let paymentList: Payment[] = []
      if (Array.isArray(data)) {
        paymentList = data
      } else if (data && Array.isArray(data.payments)) {
        paymentList = data.payments
      } else if (data && Array.isArray(data.data)) {
        paymentList = data.data
      } else {
        // If data is not an array, set to empty array
        paymentList = []
      }
      
      setPayments(paymentList || [])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load payments"
      setError(errorMessage)
      console.error('[PaymentHistoryTab Error]', err)
      setPayments([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Standard fetch-on-mount / sync-from-prop / hydrate-after-mount pattern
    // (functionally correct in this pre-Suspense/pre-React-Query codebase) —
    // not restructuring this component's data flow to satisfy the newer
    // React Compiler style rule; see other documented instances of this.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPayments()
  }, [])

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "paid":
      case "completed":
        return "bg-[#b7cba6]/20 text-[#b7cba6]"
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

  const getStatusLabel = (status: string, isMock: boolean = false) => {
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1)
    return isMock ? `${statusLabel} (Mock)` : statusLabel
  }

  const getProductName = (product: string) => {
    const names: Record<string, string> = {
      ai_snapshot: "AI Snapshot",
      ai_blueprint: "Transformation Blueprint",
      subscription: "Subscription",
      credits: "Credits",
    }
    return names[product] || product.replace(/_/g, " ")
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading payment history...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="text-gray-400">No payment history</div>
      </div>
    )
  }

  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">No payment history found</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-400 text-xs uppercase tracking-wider">
            <tr className="border-b border-white/[0.07]">
              <th className="text-left py-3">Date</th>
              <th className="text-left py-3">Product</th>
              <th className="text-left py-3">Amount</th>
              <th className="text-left py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.07]">
            {Array.isArray(payments) && payments.length > 0 && payments.map((payment, index) => {
              if (!payment) return null
              return (
                // Math.random() here previously regenerated the key on every
                // render, defeating React's reconciliation (forces a full
                // remount of the row instead of an update) whenever
                // paymentId is missing. Falling back to the array index is
                // stable across re-renders of the same list.
                <tr key={payment.paymentId || index}>
                  <td className="py-4 text-white">
                    {payment.createdAt ? new Date(payment.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    }) : 'N/A'}
                  </td>
                  <td className="py-4 text-gray-300">{getProductName(payment.product || '')}</td>
                  <td className="py-4 text-white">${(payment.amount || 0).toFixed(2)}</td>
                  <td className="py-4">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded ${getStatusColor(payment.status || '')}`}>
                        {getStatusLabel(payment.status || 'unknown', payment.is_mock)}
                      </span>
                      {payment.is_mock && (
                        <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-300 font-medium">
                          MOCK
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-center pt-4">
        <button
          onClick={fetchPayments}
          className="px-4 py-2 rounded-lg border border-white/[0.07] text-sm text-gray-300 hover:bg-white/5 transition-colors"
        >
          Refresh
        </button>
      </div>
    </div>
  )
}
