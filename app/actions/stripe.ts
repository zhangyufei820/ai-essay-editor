"use server"

import { stripe } from "@/lib/stripe"
import { PRODUCTS } from "@/lib/products"

export async function startCheckoutSession(productId: string) {
  const product = PRODUCTS.find((p) => p.id === productId)

  if (!product) {
    throw new Error(`产品 "${productId}" 不存在`)
  }

  if (product.priceInCents === 0) {
    throw new Error("免费产品无需支付")
  }

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
    // 启用支付宝和微信支付
    payment_method_types: ["card", "alipay", "wechat_pay"],
  })

  return session.client_secret
}

export async function getPaymentStatus(sessionId: string) {
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  return {
    status: session.status,
    payment_status: session.payment_status,
    customer_email: session.customer_details?.email,
  }
}
