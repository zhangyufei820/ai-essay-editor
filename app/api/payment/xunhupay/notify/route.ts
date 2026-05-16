import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { verifyXunhupaySign } from "@/lib/xunhupay"
import { getProductCredits, getProductPriceInCents, isCreditsProduct, isMembershipProduct, isPurchasableProduct } from "@/lib/products"
import { logger } from "@/lib/logger"

// 🔥 使用 Service Role Key 创建管理员客户端（绕过所有 RLS）
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const MAX_CREDITS = 10_000_000  // 单用户积分上限 1000 万

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

async function restoreClaimedOrderToPending(supabase: any, orderNo: string, reason: string) {
  const { error } = await supabase
    .from("orders")
    .update({
      status: "pending",
      updated_at: new Date().toISOString()
    })
    .eq("order_no", orderNo)
    .eq("status", "paid")

  if (error) {
    logger.error("[xunhupay] restore pending failed", { orderNo, reason, error })
  } else {
    logger.warn("[xunhupay] restored order to pending", { orderNo, reason })
  }
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
    // 支持多种请求格式（JSON 或 form-urlencoded）
    const contentType = request.headers.get('content-type') || ''
    let body: Record<string, any>
    
    if (contentType.includes('application/json')) {
      body = await request.json()
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData()
      body = Object.fromEntries(formData.entries())
    } else {
      // 尝试解析为 JSON，如果失败则尝试 form-urlencoded
      const text = await request.text()
      try {
        body = JSON.parse(text)
      } catch {
        const params = new URLSearchParams(text)
        body = Object.fromEntries(params.entries())
      }
    }
    
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

    // 生产 orders 约束只允许 pending/paid/cancelled/refunded，直接用 paid 抢占 pending 订单。
    // 这样重复回调会在权益入账前被原子挡住，避免重复加积分。
    const { data: claimedOrder, error: claimOrderError } = await supabase
      .from("orders")
      .update({
        status: "paid",
        trade_no: tradeNo,
        updated_at: new Date().toISOString()
      })
      .eq("order_no", orderNo)
      .eq("status", "pending")
      .select("id")
      .maybeSingle()

    if (claimOrderError || !claimedOrder) {
      logger.error("[xunhupay] order claim failed", { orderNo, claimOrderError })
      return new NextResponse("fail", { status: 200 })
    }

    // 🔥 查询用户当前积分记录
    const { data: currentCredits, error: creditsError } = await supabase
      .from("user_credits")
      .select("*")
      .eq("user_id", order.user_id)
      .maybeSingle()

    let balanceBefore = currentCredits?.credits || 0
    let balanceAfter = balanceBefore + credits

    if (currentCredits) {
      // 更新现有记录
      const newCredits = balanceAfter
      
      // 🛡️ 积分上限校验
      if (newCredits > MAX_CREDITS) {
        logger.error("[xunhupay] credits limit exceeded", { orderNo, userId: order.user_id, newCredits, maxCredits: MAX_CREDITS })
        await restoreClaimedOrderToPending(supabase, orderNo, "credits_limit_exceeded")
        return new NextResponse("fail", { status: 200 })
      }
      
      const newIsPro = isPro || currentCredits.is_pro // 一旦成为会员就保持
      
      logger.info("[xunhupay] updating user credits", { orderNo, userId: order.user_id, before: currentCredits.credits, after: newCredits, wasPro: currentCredits.is_pro, isPro: newIsPro })
      
      const { data: updatedCredits, error: updateError } = await supabase
        .from("user_credits")
        .update({
          credits: newCredits,
          is_pro: newIsPro,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", order.user_id)
        .eq("credits", currentCredits.credits)
        .select("credits")
        .maybeSingle()

      if (updateError || !updatedCredits || updatedCredits.credits !== newCredits) {
        logger.error("[xunhupay] credits update failed", { orderNo, updateError })
        await restoreClaimedOrderToPending(supabase, orderNo, "credits_update_failed")
        return new NextResponse("fail", { status: 200 })
      }
      logger.info("[xunhupay] user credits updated", { orderNo, userId: order.user_id })
    } else {
      // 创建新记录
      logger.info("[xunhupay] creating user credits", { orderNo, userId: order.user_id, credits, isPro })
      
      const { error: insertError } = await supabase
        .from("user_credits")
        .insert({
          user_id: order.user_id,
          credits: credits,
          is_pro: isPro
        })

      if (insertError) {
        logger.error("[xunhupay] credits insert failed", { orderNo, insertError })
        
        // 🔥 如果是外键约束错误，尝试 upsert
        if (insertError.code === '23503') {
          logger.info("[xunhupay] trying credits upsert", { orderNo, userId: order.user_id })
          const { error: upsertError } = await supabase
            .from("user_credits")
            .upsert({
              user_id: order.user_id,
              credits: credits,
              is_pro: isPro
            }, { onConflict: 'user_id' })
          
          if (upsertError) {
            logger.error("[xunhupay] credits upsert failed", { orderNo, upsertError })
            await restoreClaimedOrderToPending(supabase, orderNo, "credits_upsert_failed")
            return new NextResponse("fail", { status: 200 })
          }
          logger.info("[xunhupay] credits upserted", { orderNo, userId: order.user_id })
        } else {
          await restoreClaimedOrderToPending(supabase, orderNo, "credits_insert_failed")
          return new NextResponse("fail", { status: 200 })
        }
      } else {
        logger.info("[xunhupay] user credits created", { orderNo, userId: order.user_id })
      }
    }

    // 🔥 记录交易流水（可选，失败不影响主流程）
    try {
      await supabase.from("credit_transactions").insert({
        user_id: order.user_id,
        amount: credits,
        type: "purchase",
        description: `购买${order.product_name}获得${credits}积分`,
        balance_before: balanceBefore,
        balance_after: balanceAfter
      })
    } catch (txError) {
      logger.warn("[xunhupay] transaction log failed", { orderNo, txError })
    }

    logger.info("[xunhupay] order processed", { orderNo })
    return new NextResponse("success", { status: 200 })
    
  } catch (error) {
    logger.error("[xunhupay] notify handler failed", { error })
    return new NextResponse("fail", { status: 200 })
  }
}
