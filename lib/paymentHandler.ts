/**
 * Payment Handler - Manages Midtrans payment integration
 */

interface PaymentCallback {
  onSuccess?: () => void
  onPending?: () => void
  onError?: () => void
  onClose?: () => void
}

interface PaymentWindow {
  snap: {
    pay: (token: string, callback?: PaymentCallback) => void
  }
}

declare global {
  interface Window {
    snap?: PaymentWindow["snap"]
  }
}

/**
 * Load Midtrans Snap script
 */
export const loadMidtransScript = async (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (window.snap) {
      resolve(true)
      return
    }

    const script = document.createElement("script")
    script.src = "https://app.sandbox.midtrans.com/snap/snap.js"
    script.setAttribute("data-client-key", process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || "")
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

/**
 * Create payment transaction
 */
export const createPaymentTransaction = async (params: {
  userId: string
  amount: number
  product: string
  customerEmail: string
  customerName?: string
  customField1?: string
  customField2?: string
}): Promise<{ success: boolean; token?: string; error?: string }> => {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/payments/midtrans/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: params.userId,
          amount: params.amount,
          product: params.product,
          customer_email: params.customerEmail,
          customer_first_name: params.customerName || "Customer",
          custom_field1: params.customField1,
          custom_field2: params.customField2,
        }),
      }
    )

    if (!response.ok) {
      throw new Error("Failed to create payment transaction")
    }

    const data = await response.json()
    return {
      success: data.success,
      token: data.token,
      error: data.error,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Process payment with Midtrans
 */
export const processPayment = async (params: {
  userId: string
  amount: number
  product: string
  customerEmail: string
  customerName?: string
  customField1?: string
  customField2?: string
  onSuccess?: () => void
  onError?: (error: string) => void
}): Promise<boolean> => {
  try {
    // Create transaction
    const result = await createPaymentTransaction({
      userId: params.userId,
      amount: params.amount,
      product: params.product,
      customerEmail: params.customerEmail,
      customerName: params.customerName,
      customField1: params.customField1,
      customField2: params.customField2,
    })

    if (!result.success || !result.token) {
      throw new Error(result.error || "Failed to generate payment token")
    }

    // Load Midtrans script
    const scriptLoaded = await loadMidtransScript()
    if (!scriptLoaded || !window.snap) {
      throw new Error("Failed to load payment gateway")
    }

    // Open payment modal
    return new Promise((resolve) => {
      window.snap!.pay(result.token!, {
        onSuccess: () => {
          params.onSuccess?.()
          resolve(true)
        },
        onError: () => {
          params.onError?.("Payment failed or was cancelled")
          resolve(false)
        },
        onClose: () => {
          params.onError?.("Payment modal closed")
          resolve(false)
        },
      })
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment processing failed"
    params.onError?.(message)
    return false
  }
}

/**
 * Payment presets for common products
 */
export const paymentPresets = {
  credits: (amount: number) => ({
    product: `credits_${amount}`,
    customField1: `${amount} credits`,
  }),
  
  subscription: (tier: string) => ({
    product: tier,
    customField1: `Subscription: ${tier}`,
  }),
  
  feature: (feature: string) => ({
    product: feature,
    customField1: `Feature: ${feature}`,
  }),
}
