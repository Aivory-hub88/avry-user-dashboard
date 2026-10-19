"use client"

import { useState } from "react"
import { loadSnap } from "@/lib/midtransSnap"
import { AuthManager } from "@/lib/authManager"
import { SERVICES } from "@/config/services"
import PromoCodeField from "@/components/payment/PromoCodeField"

interface CreditPackage {
  id: string
  credits: number
  price: number
  label: string
  popular?: boolean
}

const CREDIT_PACKAGES: CreditPackage[] = [
  { id: "100", credits: 100, price: 10, label: "Best for trying" },
  { id: "500", credits: 500, price: 45, label: "Popular", popular: true },
  { id: "1000", credits: 1000, price: 85, label: "Better savings" },
  { id: "5000", credits: 5000, price: 400, label: "Best value" },
]

export default function CreditPurchaseTab() {
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null)
  const [customAmount, setCustomAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [promoCode, setPromoCode] = useState("")

  // Production Snap with the payments service's own client key (lib/midtransSnap).
  const loadMidtransScript = loadSnap

  const handlePurchasePackage = async (pkg: CreditPackage) => {
    await initiatePurchase(pkg.credits, pkg.price, `credits_${pkg.credits}`)
  }

  const handleCustomPurchase = async () => {
    if (!customAmount || isNaN(Number(customAmount)) || Number(customAmount) <= 0) {
      setError("Please enter a valid credit amount")
      return
    }

    const credits = Number(customAmount)
    // Calculate price: roughly $0.08 per credit for custom
    const price = Math.round(credits * 0.08 * 100) / 100

    await initiatePurchase(credits, price, `credits_${Math.floor(credits)}`)
  }

  const initiatePurchase = async (credits: number, price: number, product: string) => {
    try {
      setLoading(true)
      setError(null)

      const user = AuthManager.getUser()
      if (!user?.email) {
        throw new Error("User not authenticated")
      }

      const userId = AuthManager.getUserId()
      if (!userId) {
        throw new Error("User ID not found")
      }

      // Create transaction on backend
      const response = await AuthManager.authenticatedFetch(
        `${SERVICES.PAYMENTS}/api/v1/payments/midtrans/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          // The service prices the order; no amount is sent.
          body: JSON.stringify({
            user_id: userId,
            product: product,
            customer_email: user.email,
            customer_first_name: user.company_name || "Customer",
            custom_field1: `${credits} credits`,
            custom_field2: `User: ${user.email}`,
            promo_code: promoCode || undefined,
          }),
        }
      )

      if (!response.ok) {
        // A rejected promo code carries a customer-readable message.
        const body = await response.json().catch(() => null)
        const detail = body?.detail
        throw new Error(
          (typeof detail === "string" ? detail : detail?.error) ||
            "Failed to create payment transaction"
        )
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Failed to generate payment token")
      }

      if (!data.token) {
        throw new Error("Payment gateway returned no token")
      }

      // Check if using mock token
      if (data.token && data.token.startsWith("mock_token_")) {
        await confirmPurchase(data.order_id, userId, product, price, credits)
        return
      }

      // Load Midtrans snap script for real payments
      const scriptLoaded = await loadMidtransScript()
      if (!scriptLoaded || !window.snap) {
        throw new Error("Failed to load payment gateway")
      }

      // Open Midtrans payment modal
      window.snap.pay(data.token, {
        onSuccess: async () => {
          await confirmPurchase(data.order_id, userId, product, price, credits)
        },
        onPending: () => {
          setError("Payment pending. Please complete the process.")
        },
        onError: () => {
          setError("Payment failed. Please try again.")
        },
        onClose: () => {
          setError("Payment cancelled.")
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred"
      setError(message)
      console.error("Payment error:", err)
    } finally {
      setLoading(false)
    }
  }

  const confirmPurchase = async (
    orderId: string,
    userId: string,
    product: string,
    price: number,
    credits: number
  ) => {
    try {
      const confirmResponse = await AuthManager.authenticatedFetch(
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
            amount: price,
            is_mock: true,  // Flag as mock payment
          }),
        }
      )

      if (confirmResponse.ok) {
        setSelectedPackage(null)
        setCustomAmount("")
        setError(null)
        alert(`✓ MOCK PAYMENT - Successfully purchased ${credits} credits!\n\n(This is a development simulation)`)
        window.location.reload()
      } else {
        setError("Payment confirmed but failed to process credits")
      }
    } catch (err) {
      console.error("Error confirming purchase:", err)
      setError("Payment succeeded but couldn't update credits")
    }
  }

  return (
    <div className="space-y-6">
      {/* Credit Balance */}
      <div className="bg-white/[0.05] rounded-lg p-6 border border-white/[0.07]">
        <div className="flex justify-between items-start mb-4">
          <span className="text-sm text-gray-400">Available Credits</span>
          <span className="text-3xl font-bold text-accent">
            {AuthManager.getUser()?.credits || 0}
          </span>
        </div>
        <div className="flex justify-between items-center text-sm text-gray-400">
          <span>Tier</span>
          <span className="text-white capitalize">{AuthManager.getUser()?.tier || "N/A"}</span>
        </div>
      </div>

      {/* Credit Usage */}
      <div>
        <div className="flex justify-between mb-3">
          <span className="text-sm font-medium text-white">Monthly Credit Usage</span>
          <span className="text-sm text-gray-400">
            {Math.max(0, (AuthManager.getUser()?.credits_max || 0) - (AuthManager.getUser()?.credits || 0))}/
            {(AuthManager.getUser()?.credits_max || 0) === 0
              ? "0"
              : AuthManager.getUser()?.credits_max}
          </span>
        </div>
        <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
          {(AuthManager.getUser()?.credits_max || 0) > 0 ? (
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{
                width: `${
                  Math.max(0, (AuthManager.getUser()?.credits_max || 0) - (AuthManager.getUser()?.credits || 0)) /
                    (AuthManager.getUser()?.credits_max || 1) *
                  100
                }%`,
              }}
            ></div>
          ) : (
            <div className="h-full bg-white/[0.1] rounded-full"></div>
          )}
        </div>
      </div>

      {/* Usage Details */}
      <div className="border-t border-white/[0.07] pt-6 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Workflows Used</span>
          <span className="text-white">0 credits</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Agents Used</span>
          <span className="text-white">0 credits</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">AI Operations</span>
          <span className="text-white">0 credits</span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-red-500/[0.1] border border-red-500/[0.3] p-4">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Purchase Credit Packages */}
      <div className="border-t border-white/[0.07] pt-6">
        <h3 className="text-lg font-medium text-white mb-4">Purchase Credits</h3>
        <p className="text-sm text-gray-400 mb-6">Add credits to your account for immediate use</p>
        <div className="mb-6">
          <PromoCodeField
            value={promoCode}
            onChange={setPromoCode}
            products={CREDIT_PACKAGES.map((p) => `credits_${p.credits}`)}
            disabled={loading}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {CREDIT_PACKAGES.map((pkg) => (
            <button
              key={pkg.id}
              onClick={() => handlePurchasePackage(pkg)}
              disabled={loading}
              className={`rounded-lg border p-4 transition-all text-left ${
                loading
                  ? "opacity-50 cursor-not-allowed"
                  : pkg.popular
                  ? "border-accent bg-white/[0.03] hover:border-accent-btn-hover"
                  : "border-white/[0.07] bg-white/[0.01] hover:border-white/[0.1]"
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <span className="font-medium text-white">{pkg.credits.toLocaleString()} IC</span>
                <span
                  className={`text-xs ${
                    pkg.popular ? "text-accent" : "text-gray-400"
                  }`}
                >
                  {pkg.label}
                </span>
              </div>
              <div className="mb-3">
                <span className="text-2xl font-bold text-accent">${pkg.price}</span>
                <span className="text-xs text-gray-400 ml-2">
                  ${(pkg.price / pkg.credits).toFixed(3)}/IC
                </span>
              </div>
              <div
                className={`w-full py-2 px-3 rounded font-medium transition-colors ${
                  loading
                    ? "bg-white/[0.1] text-white/60 cursor-not-allowed"
                    : pkg.popular
                    ? "bg-accent text-on-accent hover:bg-accent-btn-hover"
                    : "bg-white/[0.05] text-white hover:bg-white/[0.1]"
                }`}
              >
                {loading ? "Processing..." : "Buy Now"}
              </div>
            </button>
          ))}
        </div>

        {/* Custom Amount */}
        <div className="mt-4 pt-4 border-t border-white/[0.07]">
          <p className="text-sm text-gray-400 mb-3">Need a custom amount?</p>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Enter amount in IC"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              disabled={loading}
              className="flex-1 px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.07] text-white placeholder-gray-500 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
            />
            <button
              onClick={handleCustomPurchase}
              disabled={loading || !customAmount}
              className="px-6 py-2 bg-white/[0.05] text-white text-sm font-medium rounded-lg hover:bg-white/[0.1] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Processing..." : "Buy"}
            </button>
          </div>
          {customAmount && (
            <div className="mt-2 text-xs text-gray-400">
              Price: ${(Number(customAmount) * 0.08).toFixed(2)} (approximately)
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
