import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { verifyXunhupaySign } from "@/lib/xunhupay"
import { getProductCredits, getProductPriceInCents, isCreditsProduct, isMembershipProduct, isPurchasableProduct } from "@/lib/products"
import { logger } from "@/lib/logger"
import { grantPaymentCreditsOnce } from "@/lib/payment-credit-idempotency"

const XUNHUPAY_NOTIFY_MAX_BYTES = 64 * 1024

function parseNotificationBody(rawBody: string, contentType: string): Record<string, any> {
  if (contentType.includes("application/json")) {
    const parsed = JSON.parse(rawBody)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("invalid notification payload")
    }
    return parsed
  }
  return Object.fromEntries(new URLSearchParams(rawBody).entries())
}

// 🔥 使用 Service Role Key 创建管理员客户端（绕过所有 RLS）
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function parseAmountInCents(value: unknown): number | null {
  const amount = Number.parseFloat(String(value || ""))
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.round(amount * 100)
}

function parseOrderSnapshotAmountInCents(value: unknown): number | null {
  const amount = Number.parseFloat(String(value ?? ""))
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.round(amount * 100)
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  
  try {
    // IP 限流：10次/分钟
    const { getClientIP, checkIpRateLimit, createRateLimitResponse } = await import('@/lib/rate-limit')
    const ip = getClientIP(request)
    const limitResult = checkIpRateLimit(ip, 10)
    if (!limitResult.allowed) {
      return createRateLimitResponse(limitResult.retryAfter!)
    }
    const contentType = request.headers.get('content-type') || ''
    const declaredLength = Number(request.headers.get("content-length") || 0)
    if (Number.isFinite(declaredLength) && declaredLength > XUNHUPAY_NOTIFY_MAX_BYTES) {
      return new NextResponse("fail", { status: 413 })
    }
    const rawBody = await request.text()
    if (Buffer.byteLength(rawBody, "utf8") > XUNHUPAY_NOTIFY_MAX_BYTES) {
      return new NextResponse("fail", { status: 413 })
    }
    const body = parseNotificationBody(rawBody, contentType)
    
    logger.info("[xunhupay] notify received", {
      trade_order_id: body.trade_order_id,
      status: body.status,
      transaction_id: body.transaction_id ? "[present]" : "[missing]",
      total_fee: body.total_fee,
      hasSign: Boolean(body.hash || body.sign),
      contentType,
    })

    // 验证签名：失败必须拒绝，不能继续加积分
    if (!verifyXunhupaySign(body)) {
      logger.error("[xunhupay] invalid signature")
      return new NextResponse("fail", { status: 400 })
    }

    const { trade_order_id: orderNo, transaction_id: tradeNo, status, total_fee } = body
    if (!orderNo) {
      logger.error("[xunhupay] missing order number")
      return new NextResponse("fail", { status: 400 })
    }

    // 只处理支付成功的通知
    if (status !== "OD") {
      logger.info("[xunhupay] ignored non-paid status", { status })
      return new NextResponse("fail", { status: 200 })
    }

    // 查询订单
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("order_no", orderNo)
      .single()

    if (orderError || !order) {
      logger.error("[xunhupay] order not found", { orderNo, orderError })
      return new NextResponse("fail", { status: 200 })
    }

    logger.info("[xunhupay] order loaded", { orderId: order.id, userId: order.user_id, productId: order.product_id })

    // 检查订单是否已处理
    if (order.status === "paid") {
      logger.info("[xunhupay] order already paid", { orderNo })
      return new NextResponse("success", { status: 200 })
    }
    if (order.status !== "pending") {
      logger.warn("[xunhupay] unexpected order status", { orderNo, status: order.status })
      return new NextResponse("fail", { status: 200 })
    }

    const snapshotAmountInCents = parseOrderSnapshotAmountInCents(order.amount)
    const currentCatalogAmountInCents = getProductPriceInCents(order.product_id, order.billing_cycle || "monthly")
    const expectedAmountInCents = snapshotAmountInCents ?? currentCatalogAmountInCents
    const paidAmountInCents = parseAmountInCents(total_fee)
    if (!isPurchasableProduct(order.product_id) || (!isMembershipProduct(order.product_id) && !isCreditsProduct(order.product_id))) {
      logger.error("[xunhupay] invalid product", { orderNo, productId: order.product_id })
      return new NextResponse("fail", { status: 200 })
    }
    if (expectedAmountInCents === null) {
      logger.error("[xunhupay] unknown product amount", { orderNo, productId: order.product_id })
      return new NextResponse("fail", { status: 200 })
    }
    if (paidAmountInCents !== expectedAmountInCents) {
      logger.error("[xunhupay] amount mismatch", { orderNo, paidAmountInCents, expectedAmountInCents })
      return new NextResponse("fail", { status: 200 })
    }

    const snapshotCredits = Number(order.credits_amount || 0)
    const catalogCredits = getProductCredits(order.product_id)
    const credits = snapshotCredits > 0 ? snapshotCredits : catalogCredits
    const expectedCredits = getProductCredits(order.product_id)
    const isPro = isMembershipProduct(order.product_id)
    if (!credits || (!snapshotCredits && credits !== expectedCredits)) {
      logger.error("[xunhupay] credits mismatch", { orderNo, credits, expectedCredits, snapshotCredits })
      return new NextResponse("fail", { status: 200 })
    }
    logger.info("[xunhupay] product verified", { orderNo, productId: order.product_id, credits, isPro, snapshotAmountInCents })

    const creditGrant = await grantPaymentCreditsOnce(supabase, {
      provider: "xunhupay",
      eventId: String(tradeNo || orderNo),
      referenceId: orderNo,
      orderNo,
      userId: order.user_id,
      productId: order.product_id,
      credits,
      isPro,
      description: `购买${order.product_name}获得${credits}积分`,
      metadata: { trade_no: tradeNo || null },
    })

    if (!creditGrant.ok) {
      logger.error("[xunhupay] atomic credits grant failed", { orderNo, userId: order.user_id, error: creditGrant.error })
      return new NextResponse("fail", { status: 200 })
    }

    const balanceBefore = creditGrant.balanceBefore ?? 0
    const balanceAfter = creditGrant.balanceAfter ?? balanceBefore + credits

    logger.info("[xunhupay] order processed", { orderNo, duplicate: !creditGrant.applied, balanceBefore, balanceAfter })
    return new NextResponse("success", { status: 200 })
    
  } catch (error) {
    logger.error("[xunhupay] notify handler failed", { error })
    return new NextResponse("fail", { status: 200 })
  }
}
