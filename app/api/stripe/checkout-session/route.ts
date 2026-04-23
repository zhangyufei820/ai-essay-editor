import { NextRequest, NextResponse } from "next/server"

import { PRODUCTS } from "@/lib/products"
import { stripe } from "@/lib/stripe"

type CheckoutSessionRequest = {
  productId?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as CheckoutSessionRequest
    const productId = typeof body.productId === "string" ? body.productId : ""

    if (!productId) {
      return NextResponse.json({ error: "productId is required" }, { status: 400 })
    }

    if (!stripe) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 })
    }

    const product = PRODUCTS.find((item) => item.id === productId)
    if (!product) {
      return NextResponse.json({ error: `Unknown product: ${productId}` }, { status: 404 })
    }

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
    })

    return NextResponse.json({ clientSecret: session.client_secret })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create checkout session"
    console.error("[StripeCheckout] Session creation failed:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
