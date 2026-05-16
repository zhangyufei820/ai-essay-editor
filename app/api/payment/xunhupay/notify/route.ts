import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { verifyXunhupaySign } from "@/lib/xunhupay"
import { getProductCredits, getProductPriceInCents, isCreditsProduct, isMembershipProduct, isPurchasableProduct } from "@/lib/products"

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
    console.error(`[迅虎支付] 恢复订单 pending 失败: order=${orderNo}, reason=${reason}`, error)
  } else {
    console.warn(`[迅虎支付] 已恢复订单为 pending，等待幂等重试: order=${orderNo}, reason=${reason}`)
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
    
    console.log("[迅虎支付] 收到回调:", {
      trade_order_id: body.trade_order_id,
      status: body.status,
      transaction_id: body.transaction_id ? "[present]" : "[missing]",
      total_fee: body.total_fee,
      hasSign: Boolean(body.hash || body.sign),
    })
    console.log("[迅虎支付] Content-Type:", contentType)

    // 验证签名：失败必须拒绝，不能继续加积分
    if (!verifyXunhupaySign(body)) {
      console.error("[迅虎支付] 签名验证失败，拒绝处理订单")
      return new NextResponse("fail", { status: 400 })
    }

    const { trade_order_id: orderNo, transaction_id: tradeNo, status, total_fee } = body
    if (!orderNo) {
      console.error("[迅虎支付] 回调缺少订单号")
      return new NextResponse("fail", { status: 400 })
    }

    // 只处理支付成功的通知
    if (status !== "OD") {
      console.log("[迅虎支付] 订单状态不是 OD:", status)
      return new NextResponse("fail", { status: 200 })
    }

    // 查询订单
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("order_no", orderNo)
      .single()

    if (orderError || !order) {
      console.error("[迅虎支付] 订单不存在:", orderNo, orderError)
      return new NextResponse("fail", { status: 200 })
    }

    console.log("[迅虎支付] 找到订单:", order.id, "用户:", order.user_id, "产品:", order.product_id)

    // 检查订单是否已处理
    if (order.status === "paid") {
      console.log("[迅虎支付] 订单已支付，跳过处理")
      return new NextResponse("success", { status: 200 })
    }
    if (order.status !== "pending") {
      console.warn("[迅虎支付] 订单状态非 pending，拒绝重复或异常回调:", order.status)
      return new NextResponse("fail", { status: 200 })
    }

    const snapshotAmountInCents = parseOrderSnapshotAmountInCents(order.amount)
    const currentCatalogAmountInCents = getProductPriceInCents(order.product_id, order.billing_cycle || "monthly")
    const expectedAmountInCents = snapshotAmountInCents ?? currentCatalogAmountInCents
    const paidAmountInCents = parseAmountInCents(total_fee)
    if (!isPurchasableProduct(order.product_id) || (!isMembershipProduct(order.product_id) && !isCreditsProduct(order.product_id))) {
      console.error("[迅虎支付] 产品类型非法或不可购买，拒绝处理:", order.product_id)
      return new NextResponse("fail", { status: 200 })
    }
    if (expectedAmountInCents === null) {
      console.error("[迅虎支付] 未知产品或不可购买产品，拒绝处理:", order.product_id)
      return new NextResponse("fail", { status: 200 })
    }
    if (paidAmountInCents !== expectedAmountInCents) {
      console.error(`[迅虎支付] 金额不匹配，拒绝处理: order=${orderNo}, paid=${paidAmountInCents}, expected=${expectedAmountInCents}`)
      return new NextResponse("fail", { status: 200 })
    }

    const snapshotCredits = Number(order.credits_amount || 0)
    const catalogCredits = getProductCredits(order.product_id)
    const credits = snapshotCredits > 0 ? snapshotCredits : catalogCredits
    const expectedCredits = getProductCredits(order.product_id)
    const isPro = isMembershipProduct(order.product_id)
    if (!credits || (!snapshotCredits && credits !== expectedCredits)) {
      console.error(`[迅虎支付] 积分数量不匹配，拒绝处理: order=${orderNo}, credits=${credits}, expected=${expectedCredits}, snapshot=${snapshotCredits}`)
      return new NextResponse("fail", { status: 200 })
    }
    console.log(`[迅虎支付] 产品校验通过: ${order.product_id} → 积分=${credits}, isPro=${isPro}, amountSnapshot=${snapshotAmountInCents}`)

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
      console.error("[迅虎支付] 订单抢占失败或状态已变化:", claimOrderError)
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
        console.error(`[迅虎支付] ⚠️ 积分超限拒绝: userId=${order.user_id}, newCredits=${newCredits} > MAX=${MAX_CREDITS}`)
        await restoreClaimedOrderToPending(supabase, orderNo, "credits_limit_exceeded")
        return new NextResponse("fail", { status: 200 })
      }
      
      const newIsPro = isPro || currentCredits.is_pro // 一旦成为会员就保持
      
      console.log(`[迅虎支付] 更新用户积分: ${currentCredits.credits} → ${newCredits}, is_pro: ${currentCredits.is_pro} → ${newIsPro}`)
      
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
        console.error("[迅虎支付] 更新积分失败:", updateError)
        await restoreClaimedOrderToPending(supabase, orderNo, "credits_update_failed")
        return new NextResponse("fail", { status: 200 })
      }
      console.log(`[迅虎支付] ✅ 用户 ${order.user_id} 积分更新成功`)
    } else {
      // 创建新记录
      console.log(`[迅虎支付] 用户无积分记录，创建新记录: 积分=${credits}, is_pro=${isPro}`)
      
      const { error: insertError } = await supabase
        .from("user_credits")
        .insert({
          user_id: order.user_id,
          credits: credits,
          is_pro: isPro
        })

      if (insertError) {
        console.error("[迅虎支付] 创建积分记录失败:", insertError)
        
        // 🔥 如果是外键约束错误，尝试 upsert
        if (insertError.code === '23503') {
          console.log("[迅虎支付] 尝试使用 upsert...")
          const { error: upsertError } = await supabase
            .from("user_credits")
            .upsert({
              user_id: order.user_id,
              credits: credits,
              is_pro: isPro
            }, { onConflict: 'user_id' })
          
          if (upsertError) {
            console.error("[迅虎支付] upsert 也失败:", upsertError)
            await restoreClaimedOrderToPending(supabase, orderNo, "credits_upsert_failed")
            return new NextResponse("fail", { status: 200 })
          }
          console.log("[迅虎支付] ✅ upsert 成功")
        } else {
          await restoreClaimedOrderToPending(supabase, orderNo, "credits_insert_failed")
          return new NextResponse("fail", { status: 200 })
        }
      } else {
        console.log(`[迅虎支付] ✅ 用户 ${order.user_id} 积分记录创建成功`)
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
      console.log("[迅虎支付] 记录交易流水失败（不影响主流程）:", txError)
    }

    console.log(`[迅虎支付] ✅ 订单 ${orderNo} 处理完成`)
    return new NextResponse("success", { status: 200 })
    
  } catch (error) {
    console.error("[迅虎支付] 处理回调错误:", error)
    return new NextResponse("fail", { status: 200 })
  }
}
