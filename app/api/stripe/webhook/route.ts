import { NextResponse, type NextRequest } from "next/server"

import { addCredits } from "@/lib/credits"
import { getProductCredits } from "@/lib/products"
import { stripe } from "@/lib/stripe"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook is not configured" }, { status: 503 })
  }

  const signature = request.headers.get("stripe-signature")
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 })
  }

  let event
  try {
    const rawBody = await request.text()
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (error) {
    console.warn("[StripeWebhook] Signature verification failed")
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object
  const userId = session.client_reference_id || session.metadata?.userId || ""
  const productId = session.metadata?.productId || ""
  const credits = getProductCredits(productId)

  if (!userId || !productId || credits <= 0) {
    console.error("[StripeWebhook] Missing session metadata", {
      sessionId: session.id,
      hasUserId: Boolean(userId),
      productId,
      credits,
    })
    return NextResponse.json({ error: "Invalid session metadata" }, { status: 400 })
  }

  const success = await addCredits(
    userId,
    credits,
    "purchase",
    `Stripe 支付成功，购买 ${productId}，到账 ${credits} 积分`,
    session.id,
  )

  if (!success) {
    return NextResponse.json({ error: "Failed to grant credits" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
