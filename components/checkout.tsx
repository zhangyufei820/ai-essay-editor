"use client"

import { useCallback, useState, useEffect } from "react"
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"
import { Loader2, AlertCircle } from "lucide-react"

import { startCheckoutSession } from "@/app/actions/stripe"

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

export default function Checkout({ productId }: { productId: string }) {
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  const fetchClientSecret = useCallback(async () => {
    try {
      const clientSecret = await startCheckoutSession(productId)
      if (!clientSecret) {
        throw new Error("无法创建支付会话")
      }
      return clientSecret
    } catch (err: any) {
      console.error("[v0] Stripe checkout error:", err)
      setCheckoutError(err?.message || "支付初始化失败")
      throw err
    }
  }, [productId])

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
      setError("Stripe 未配置")
      return
    }
    setIsReady(true)
  }, [])

  if (error || checkoutError) {
    return (
      <div className="w-full p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-orange-800">Stripe 支付暂时不可用</p>
          <p className="text-sm text-orange-700 mt-1">
            {error || checkoutError || "请使用上方的迅虎支付宝或微信支付。"}
          </p>
        </div>
      </div>
    )
  }

  if (!isReady || !stripePromise) {
    return (
      <div className="w-full flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载支付组件...</span>
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
