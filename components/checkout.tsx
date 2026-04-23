"use client"

import { useCallback, useEffect, useState } from "react"
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"
import { AlertCircle, Loader2 } from "lucide-react"

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

type CheckoutSessionResponse = {
  clientSecret?: string
  error?: string
}

export default function Checkout({ productId }: { productId: string }) {
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  const fetchClientSecret = useCallback(async () => {
    try {
      const response = await fetch("/api/stripe/checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ productId }),
      })

      const payload = await response.json() as CheckoutSessionResponse
      if (!response.ok) {
        throw new Error(payload.error || "Failed to create checkout session")
      }

      if (!payload.clientSecret) {
        throw new Error("Failed to create checkout session")
      }

      return payload.clientSecret
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Checkout initialization failed"
      console.error("[v0] Stripe checkout error:", err)
      setCheckoutError(message)
      throw err
    }
  }, [productId])

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
      setError("Stripe is not configured")
      return
    }

    setIsReady(true)
  }, [])

  if (error || checkoutError) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-4 w-full">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-600" />
        <div>
          <p className="text-sm font-medium text-orange-800">Stripe checkout is unavailable</p>
          <p className="mt-1 text-sm text-orange-700">
            {error || checkoutError || "Please use the other payment methods above."}
          </p>
        </div>
      </div>
    )
  }

  if (!isReady || !stripePromise) {
    return (
      <div className="flex w-full items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading checkout...</span>
      </div>
    )
  }

  return (
    <div id="checkout" className="w-full">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  )
}
