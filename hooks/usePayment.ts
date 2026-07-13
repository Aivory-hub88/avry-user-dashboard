'use client'

import { useState } from 'react'
import { AuthManager } from '@/lib/authManager'
import { SERVICES } from '@/config/services'

/**
 * Shared Midtrans purchase flow — one-time feature unlocks (ai_diagnostic/
 * ai_blueprint/ai_fullstack) and subscription tiers (foundation/acceleration/
 * intelligence) both go through this. In dev, the backend returns a
 * mock_token_ and the purchase is confirmed immediately with no real charge;
 * in prod it opens the real Midtrans Snap modal.
 */
export function usePayment() {
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const loadMidtransScript = async () => {
    return new Promise<boolean>((resolve) => {
      if ((window as any).snap) {
        resolve(true)
        return
      }
      const script = document.createElement('script')
      script.src = 'https://app.sandbox.midtrans.com/snap/snap.js'
      script.setAttribute('data-client-key', process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || '')
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }

  const finalizePurchase = async (
    orderId: string,
    userId: string,
    product: string,
    amount: number,
    productName: string,
    isMock: boolean
  ) => {
    try {
      const confirmResponse = await fetch(`${SERVICES.PAYMENTS}/api/v1/payments/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          user_id: userId,
          product,
          amount,
          is_mock: isMock,
        }),
      })

      if (confirmResponse.ok) {
        setPaymentError(null)
        alert(
          isMock
            ? `✓ MOCK PAYMENT - Successfully purchased ${productName}!\n\n(This is a development simulation)`
            : `Successfully purchased ${productName}!`
        )
        window.location.reload()
      } else {
        setPaymentError('Payment confirmed but failed to process purchase')
      }
    } catch (err) {
      console.error('Error finalizing purchase:', err)
      setPaymentError("Payment succeeded but couldn't update account")
    }
  }

  const handlePayment = async (product: string, amount: number, productName: string) => {
    try {
      setPaymentLoading(true)
      setPaymentError(null)

      const user = AuthManager.getUser()
      if (!user?.email) throw new Error('User not authenticated')

      const userId = AuthManager.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const isSubscription = ['foundation', 'acceleration', 'intelligence'].includes(product)
      const isOneTimePurchase = product.startsWith('ai_')
      const isCreditTopUp = product.startsWith('credits_')

      if (!isSubscription && !isOneTimePurchase && !isCreditTopUp) {
        throw new Error('Unknown product type')
      }

      const response = await fetch(`${SERVICES.PAYMENTS}/api/v1/payments/midtrans/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          amount,
          product,
          customer_email: user.email,
          customer_first_name: user.company_name || 'Customer',
          custom_field1: `Purchase: ${productName}`,
          custom_field2: `User: ${user.email}`,
        }),
      })

      if (!response.ok) throw new Error(`Backend error: ${response.status}`)

      const data = await response.json()
      if (!data.success) throw new Error(data.error || 'Failed to create payment transaction')
      if (!data.token) throw new Error('Payment gateway returned no token')

      if (data.token.startsWith('mock_token_')) {
        await finalizePurchase(data.order_id, userId, product, amount, productName, true)
        return
      }

      const scriptLoaded = await loadMidtransScript()
      if (!scriptLoaded || !(window as any).snap) {
        throw new Error('Failed to load payment gateway')
      }

      ;(window as any).snap.pay(data.token, {
        onSuccess: async () => {
          await finalizePurchase(data.order_id, userId, product, amount, productName, false)
        },
        onPending: () => setPaymentError('Payment pending. Please complete the process.'),
        onError: () => setPaymentError('Payment failed. Please try again.'),
        onClose: () => setPaymentError('Payment cancelled.'),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setPaymentError(message)
      console.error('Payment error:', err)
    } finally {
      setPaymentLoading(false)
    }
  }

  return { handlePayment, paymentLoading, paymentError, setPaymentError }
}
