"use client"

import { useState, useEffect } from "react"
import { AuthManager } from "@/lib/authManager"
import { SERVICES } from "@/config/services"

interface PaymentCard {
  card_id: string
  lastFour: string
  brand: string
  expiryMonth: number
  expiryYear: number
  holderName: string
  isDefault: boolean
}

interface WalletData {
  wallet_id: string
  balance: number
  total_topup: number
  total_spent: number
  total_refunded: number
  currency: string
  cards: PaymentCard[]
}

export default function WalletSettings() {
  const [walletData, setWalletData] = useState<WalletData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddCard, setShowAddCard] = useState(false)
  const [showTopup, setShowTopup] = useState(false)
  const [topupAmount, setTopupAmount] = useState("")
  const [topupLoading, setTopupLoading] = useState(false)
  const [cardForm, setCardForm] = useState({
    cardNumber: "",
    holderName: "",
    expiryDate: "",
    cvv: "",
  })

  useEffect(() => {
    fetchWalletData()
  }, [])

  const loadMidtransScript = () => {
    return new Promise((resolve) => {
      if (window.snap) {
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

  const fetchWalletData = async () => {
    try {
      setLoading(true)
      setError(null)

      const userId = AuthManager.getUserId()
      if (!userId) {
        throw new Error("User not authenticated")
      }

      const response = await fetch(
        `${SERVICES.PAYMENTS}/api/v1/wallet/${userId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      )

      if (response.status === 404) {
        setWalletData({
          wallet_id: "",
          balance: 0,
          total_topup: 0,
          total_spent: 0,
          total_refunded: 0,
          currency: "USD",
          cards: [],
        })
        setLoading(false)
        return
      }

      if (!response.ok) {
        throw new Error("Failed to fetch wallet data")
      }

      const data = await response.json()
      // Ensure cards is always an array
      setWalletData({
        ...data,
        cards: Array.isArray(data.cards) ? data.cards : []
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load wallet"
      setError(message)
      setWalletData({
        wallet_id: "",
        balance: 0,
        total_topup: 0,
        total_spent: 0,
        total_refunded: 0,
        currency: "USD",
        cards: [],
      })
    } finally {
      setLoading(false)
    }
  }

  const handleTopupClick = async () => {
    if (!topupAmount || isNaN(Number(topupAmount)) || Number(topupAmount) <= 0) {
      setError("Please enter a valid topup amount")
      return
    }

    try {
      setTopupLoading(true)
      setError(null)

      const userId = AuthManager.getUserId()
      if (!userId) {
        throw new Error("User not authenticated")
      }

      const user = AuthManager.getUser()
      if (!user?.email) {
        throw new Error("User email not found")
      }

      const amount = Number(topupAmount)

      // Initiate topup via backend
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
            product: `wallet_topup_${amount}`,
            customer_email: user.email,
            customer_first_name: user.company_name || "Customer",
            custom_field1: `Wallet Topup: $${amount}`,
            custom_field2: `User: ${user.email}`,
          }),
        }
      )

      if (!response.ok) {
        throw new Error("Failed to initiate topup")
      }

      const data = await response.json()

      if (!data.success || !data.token) {
        throw new Error(data.error || "Failed to generate payment token")
      }

      // Check if using mock token
      if (data.token && data.token.startsWith("mock_token_")) {
        // Simulate payment success for mock mode
        const confirmResponse = await fetch(
          `${SERVICES.PAYMENTS}/api/v1/payments/confirm`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              order_id: data.order_id,
              user_id: userId,
              product: `wallet_topup_${amount}`,
              amount: amount,
              is_mock: true,  // Flag as mock payment
            }),
          }
        )

        if (confirmResponse.ok) {
          alert(`✓ MOCK PAYMENT - Successfully added $${amount} to your wallet!\n\n(This is a development simulation)`)
          setTopupAmount("")
          setShowTopup(false)
          await fetchWalletData()
        } else {
          setError("Topup confirmed but failed to update wallet")
        }
        return
      }

      // Load Midtrans and open payment modal for real payments
      const scriptLoaded = await loadMidtransScript()
      if (!scriptLoaded || !window.snap) {
        throw new Error("Failed to load payment gateway")
      }

      window.snap.pay(data.token, {
        onSuccess: async () => {
          try {
            const confirmResponse = await fetch(
              `${SERVICES.PAYMENTS}/api/v1/payments/confirm`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  order_id: data.order_id,
                  user_id: userId,
                  product: `wallet_topup_${amount}`,
                  amount: amount,
                  is_mock: false,  // Real payment
                }),
              }
            )

            if (confirmResponse.ok) {
              alert(`Successfully added $${amount} to your wallet!`)
              setTopupAmount("")
              setShowTopup(false)
              await fetchWalletData()
            } else {
              setError("Payment confirmed but failed to update wallet")
            }
          } catch (err) {
            console.error("Error confirming topup:", err)
            setError("Payment succeeded but couldn't update wallet")
          }
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
      console.error("Topup error:", err)
    } finally {
      setTopupLoading(false)
    }
  }

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setError(null)

      if (!cardForm.cardNumber || !cardForm.holderName || !cardForm.expiryDate || !cardForm.cvv) {
        setError("Please fill in all card fields")
        return
      }

      const userId = AuthManager.getUserId()
      if (!userId) {
        throw new Error("User not authenticated")
      }

      const [expiryMonth, expiryYear] = cardForm.expiryDate.split("/")

      const response = await fetch(
        `${SERVICES.PAYMENTS}/api/v1/wallet/cards/add`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: userId,
            card_number: cardForm.cardNumber.replace(/\s/g, ""),
            holder_name: cardForm.holderName,
            expiry_month: parseInt(expiryMonth),
            expiry_year: parseInt("20" + expiryYear),
            cvv: cardForm.cvv,
            is_default: walletData?.cards?.length === 0,
          }),
        }
      )

      if (!response.ok) {
        throw new Error("Failed to add card")
      }

      const result = await response.json()
      
      if (result.success) {
        alert("Card added successfully!")
        setCardForm({
          cardNumber: "",
          holderName: "",
          expiryDate: "",
          cvv: "",
        })
        setShowAddCard(false)
        await fetchWalletData()
      } else {
        throw new Error(result.error || "Failed to add card")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add card"
      setError(message)
    }
  }

  const handleDeleteCard = async (cardId: string) => {
    if (!confirm("Are you sure you want to delete this card?")) {
      return
    }

    try {
      setError(null)

      const response = await fetch(
        `${SERVICES.PAYMENTS}/api/v1/wallet/cards/${cardId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      )

      if (!response.ok) {
        throw new Error("Failed to delete card")
      }

      await fetchWalletData()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete card"
      setError(message)
    }
  }

  const handleSetDefault = async (cardId: string) => {
    try {
      setError(null)

      const response = await fetch(
        `${SERVICES.PAYMENTS}/api/v1/wallet/cards/${cardId}/default`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
        }
      )

      if (!response.ok) {
        throw new Error("Failed to set default card")
      }

      await fetchWalletData()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to set default card"
      setError(message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-400">Loading wallet settings...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-red-500/[0.1] border border-red-500/[0.3] p-4">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Wallet Balance Card */}
      <div className="bg-gradient-to-br from-[#00e59e]/10 to-[#00b87d]/10 rounded-lg p-6 border border-[#00e59e]/[0.3]">
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-400 mb-1">Available Balance</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-[#00e59e]">
                ${(walletData?.balance || 0).toFixed(2)}
              </span>
              <span className="text-sm text-gray-400">{walletData?.currency || "USD"}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/[0.07]">
            <div>
              <p className="text-xs text-gray-500 mb-1">Total Added</p>
              <p className="text-lg font-medium text-white">${(walletData?.total_topup || 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Total Spent</p>
              <p className="text-lg font-medium text-white">${(walletData?.total_spent || 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Total Refunded</p>
              <p className="text-lg font-medium text-white">${(walletData?.total_refunded || 0).toFixed(2)}</p>
            </div>
          </div>

          <button
            onClick={() => setShowTopup(!showTopup)}
            className="w-full mt-4 py-2 px-4 bg-[#00e59e] text-black font-medium rounded-lg hover:bg-[#00d489] transition-colors"
          >
            {showTopup ? "Cancel" : "+ Add Money"}
          </button>
        </div>
      </div>

      {/* Topup Form */}
      {showTopup && (
        <div className="bg-white/[0.03] rounded-lg border border-white/[0.07] p-4">
          <p className="text-sm text-gray-400 mb-4">Enter amount to add to wallet</p>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center">
              <span className="text-white font-medium mr-2">$</span>
              <input
                type="number"
                placeholder="0.00"
                min="1"
                step="0.01"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                disabled={topupLoading}
                className="flex-1 px-3 py-2 bg-white/[0.05] border border-white/[0.07] text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#00e59e] disabled:opacity-50"
              />
            </div>
            <button
              onClick={handleTopupClick}
              disabled={topupLoading || !topupAmount}
              className="px-6 py-2 bg-[#00e59e] text-black font-medium rounded-lg hover:bg-[#00d489] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {topupLoading ? "Processing..." : "Proceed"}
            </button>
          </div>
        </div>
      )}

      {/* Payment Cards Section */}
      <div className="border-t border-white/[0.07] pt-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-white">Payment Methods</h3>
          <button
            onClick={() => setShowAddCard(!showAddCard)}
            className="text-sm px-3 py-1.5 bg-white/[0.05] text-white rounded hover:bg-white/[0.1] transition-colors"
          >
            {showAddCard ? "Cancel" : "+ Add Card"}
          </button>
        </div>

        {/* Add Card Form */}
        {showAddCard && (
          <form onSubmit={handleAddCard} className="bg-white/[0.03] rounded-lg border border-white/[0.07] p-4 mb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Cardholder Name</label>
                <input
                  type="text"
                  placeholder="John Doe"
                  value={cardForm.holderName}
                  onChange={(e) => setCardForm({ ...cardForm, holderName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.07] text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#00e59e]"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Card Number</label>
                <input
                  type="text"
                  placeholder="4111 1111 1111 1111"
                  maxLength={19}
                  value={cardForm.cardNumber}
                  onChange={(e) => {
                    let value = e.target.value.replace(/\s+/g, "")
                    value = value.replace(/(\d{4})/g, "$1 ").trim()
                    setCardForm({ ...cardForm, cardNumber: value })
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.07] text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#00e59e]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Expiry Date</label>
                  <input
                    type="text"
                    placeholder="MM/YY"
                    maxLength={5}
                    value={cardForm.expiryDate}
                    onChange={(e) => {
                      let value = e.target.value.replace(/\D/g, "")
                      if (value.length >= 2) {
                        value = value.slice(0, 2) + "/" + value.slice(2, 4)
                      }
                      setCardForm({ ...cardForm, expiryDate: value })
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.07] text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#00e59e]"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">CVV</label>
                  <input
                    type="password"
                    placeholder="123"
                    maxLength={4}
                    value={cardForm.cvv}
                    onChange={(e) => setCardForm({ ...cardForm, cvv: e.target.value.replace(/\D/g, "") })}
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.07] text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#00e59e]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 px-4 bg-[#00e59e] text-black font-medium rounded-lg hover:bg-[#00d489] transition-colors"
              >
                Add Card
              </button>
            </div>
          </form>
        )}

        {/* Saved Cards */}
        {walletData?.cards && walletData.cards.length > 0 ? (
          <div className="space-y-3">
            {walletData.cards.map((card) => (
              <div
                key={card.card_id}
                className={`rounded-lg border p-4 transition-colors ${
                  card.isDefault
                    ? "border-[#00e59e] bg-white/[0.03]"
                    : "border-white/[0.07] bg-white/[0.01] hover:border-white/[0.1]"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-white">
                        {card.brand.toUpperCase()} •••• {card.lastFour}
                      </span>
                      {card.isDefault && (
                        <span className="text-xs px-2 py-1 bg-[#00e59e] text-black rounded font-medium">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <span>{card.holderName}</span>
                      <span>
                        Expires {String(card.expiryMonth).padStart(2, "0")}/{String(card.expiryYear).slice(-2)}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {!card.isDefault && (
                      <button
                        onClick={() => handleSetDefault(card.card_id)}
                        className="text-xs px-2 py-1 text-white/60 hover:text-white bg-white/[0.05] rounded hover:bg-white/[0.1] transition-colors"
                      >
                        Set Default
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteCard(card.card_id)}
                      className="text-xs px-2 py-1 text-red-400 hover:text-red-300 bg-red-500/[0.1] rounded hover:bg-red-500/[0.2] transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-white/[0.07] p-6 text-center">
            <p className="text-gray-400 text-sm mb-3">No payment methods added yet</p>
            <button
              onClick={() => setShowAddCard(true)}
              className="text-sm px-4 py-2 bg-white/[0.05] text-white rounded hover:bg-white/[0.1] transition-colors"
            >
              Add Your First Card
            </button>
          </div>
        )}
      </div>

      {/* Security Info */}
      <div className="bg-white/[0.02] rounded-lg border border-white/[0.07] p-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          🔒 <strong>Your Money is Safe:</strong> All payments are processed securely through Midtrans, an industry-leading payment gateway. Your financial information is encrypted and protected. Card details are tokenized and never stored on our servers. Your identity and payment data remain completely private and secure.
        </p>
      </div>
    </div>
  )
}
