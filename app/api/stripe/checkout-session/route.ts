import { NextRequest, NextResponse } from "next/server"

import { validateProductPurchase } from "@/lib/products"
import { requireLearningUserId } from "@/lib/learning-user"
import { applyRateLimit } from "@/lib/rate-limit"
import { stripe } from "@/lib/stripe"
import { getUserEntitlementSummary } from "@/lib/user-entitlements"
import { rejectUntrustedOrigin } from "@/lib/security/request"

type CheckoutSessionRequest = {
  productId?: string
  userId?: string
}

export async function POST(request: NextRequest) {
  try {
    const rateLimited = applyRateLimit(request, { keyPrefix: 'stripe-checkout', maxRequests: 10 })
    if (rateLimited) return rateLimited
    const originRejected = rejectUntrustedOrigin(request)
    if (originRejected) return originRejected

    const body = await request.json() as CheckoutSessionRequest
    const productId = typeof body.productId === "string" ? body.productId : ""
    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response
    const userId = auth.userId!

    if (!productId) {
      return NextResponse.json({ error: "productId is required" }, { status: 400 })
    }

    if (!stripe) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 })
    }

    const entitlement = await getUserEntitlementSummary(userId, {
      email: auth.auth.user?.email,
      phone: auth.auth.user?.phone,
      metadata: auth.auth.user?.metadata,
    })
    const purchase = validateProductPurchase(productId, entitlement?.membershipStatus || null)
    if (!purchase.ok) {
      return NextResponse.json({ error: purchase.error }, { status: purchase.status })
    }
    const product = purchase.product

    if (product.priceInCents === 0) {
      return NextResponse.json({ error: "Free products do not require checkout" }, { status: 400 })
    }

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      redirect_on_completion: "never",
      line_items: [
        {
          price_data: {
            currency: "cny",
            product_data: {
              name: product.name,
              description: product.description,
            },
            unit_amount: product.priceInCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      payment_method_types: ["card"],
      client_reference_id: userId,
      metadata: {
        userId,
        productId,
      },
    })

    return NextResponse.json({ clientSecret: session.client_secret })
  } catch (error: unknown) {
    console.error("[StripeCheckout] Session creation failed:", error)
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 })
  }
}
