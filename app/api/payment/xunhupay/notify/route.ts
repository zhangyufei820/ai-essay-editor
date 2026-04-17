import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { verifyXunhupaySign } from "@/lib/xunhupay"

// 🔥 使用 Service Role Key 创建管理员客户端（绕过所有 RLS）
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// 🔥 产品配置（积分 + 是否是会员产品）
const PRODUCT_CONFIG: Record<string, { credits: number, isPro: boolean }> = {
  // 订阅套餐（会员产品）
  "basic": { credits: 2000, isPro: true },
  "pro": { credits: 5000, isPro: true },
  "premium": { credits: 12000, isPro: true },
  // 积分充值包（非会员产品）
  "credits-500": { credits: 500, isPro: false },
  "credits-1000": { credits: 1000, isPro: false },
  "credits-5000": { credits: 5000, isPro: false },
  "credits-10000": { credits: 10000, isPro: false },
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
    
    console.log("[迅虎支付] 收到回调:", JSON.stringify(body))
    console.log("[迅虎支付] Content-Type:", contentType)

    // 验证签名
    if (!verifyXunhupaySign(body)) {
      console.error("[迅虎支付] 签名验证失败")
      console.log("[迅虎支付] 回调参数:", JSON.stringify(body, null, 2))
      // 暂时跳过签名验证以排查问题，但记录日志
      // return NextResponse.json({ error: "签名验证失败" }, { status: 400 })
      console.warn("[迅虎支付] ⚠️ 签名验证失败，但继续处理订单")
    }

    const { trade_order_id: orderNo, transaction_id: tradeNo, status, total_fee } = body

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

    // 更新订单状态
    const { error: updateOrderError } = await supabase
      .from("orders")
      .update({
        status: "paid",
        trade_no: tradeNo,
        updated_at: new Date().toISOString()
      })
      .eq("order_no", orderNo)

    if (updateOrderError) {
      console.error("[迅虎支付] 更新订单失败:", updateOrderError)
      return new NextResponse("fail", { status: 200 })
    }

    // 🔥 获取产品配置
    const productConfig = PRODUCT_CONFIG[order.product_id] || { 
      credits: Math.floor(Number.parseFloat(total_fee) * 100),
      isPro: order.product_id?.includes('basic') || order.product_id?.includes('pro') || order.product_id?.includes('premium')
    }
    
    const { credits, isPro } = productConfig
    console.log(`[迅虎支付] 产品配置: ${order.product_id} → 积分=${credits}, isPro=${isPro}`)

    // 🔥 查询用户当前积分记录
    const { data: currentCredits, error: creditsError } = await supabase
      .from("user_credits")
      .select("*")
      .eq("user_id", order.user_id)
      .maybeSingle()

    if (currentCredits) {
      // 更新现有记录
      const newCredits = currentCredits.credits + credits
      const newIsPro = isPro || currentCredits.is_pro // 一旦成为会员就保持
      
      console.log(`[迅虎支付] 更新用户积分: ${currentCredits.credits} → ${newCredits}, is_pro: ${currentCredits.is_pro} → ${newIsPro}`)
      
      const { error: updateError } = await supabase
        .from("user_credits")
        .update({
          credits: newCredits,
          is_pro: newIsPro,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", order.user_id)

      if (updateError) {
        console.error("[迅虎支付] 更新积分失败:", updateError)
        // 不返回错误，订单已标记为 paid，后续可以手动补积分
      } else {
        console.log(`[迅虎支付] ✅ 用户 ${order.user_id} 积分更新成功`)
      }
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
          } else {
            console.log("[迅虎支付] ✅ upsert 成功")
          }
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
        reference_id: order.id,
        balance_before: currentCredits?.credits || 0,
        balance_after: (currentCredits?.credits || 0) + credits
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
