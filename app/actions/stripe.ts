"use server"

import { stripe } from "@/lib/stripe"
import { PRODUCTS } from "@/lib/products"

export async function startCheckoutSession(productId: string) {
  if (!stripe) {
    throw new Error("Stripe 未配置，请使用其他支付方式")
  }

  const product = PRODUCTS.find((p) => p.id === productId)

  if (!product) {
    throw new Error(`产品 "${productId}" 不存在`)
  }

  if (product.priceInCents === 0) {
    throw new Error("免费产品无需支付")
  }

  try {
    // 创建Stripe结账会话，支持多种支付方式
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      redirect_on_completion: "never",
      line_items: [
        {
          price_data: {
            currency: "cny", // 使用人民币
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

    return session.client_secret
  } catch (error: any) {
    console.error("[v0] Stripe session creation error:", error)
    throw new Error(error?.message || "创建支付会话失败")
  }
}

export async function getPaymentStatus(sessionId: string) {
  if (!stripe) {
    throw new Error("Stripe 未配置")
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId)
  return {
    status: session.status,
    payment_status: session.payment_status,
    customer_email: session.customer_details?.email,
  }
}
