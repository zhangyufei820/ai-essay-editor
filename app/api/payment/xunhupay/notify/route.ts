import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { verifyXunhupaySign } from "@/lib/xunhupay"
import { addCredits } from "@/lib/credits"

// 🔥 产品积分映射表（与 lib/products.ts 保持一致）
const PRODUCT_CREDITS: Record<string, number> = {
  // 订阅套餐
  "basic": 2000,      // 基础版 28元 → 2000积分
  "pro": 5000,        // 专业版 68元 → 5000积分
  "premium": 12000,   // 豪华版 128元 → 12000积分
  // 积分充值包
  "credits-500": 500,
  "credits-1000": 1000,
  "credits-5000": 5000,
  "credits-10000": 10000,
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    console.log("[迅虎支付] 收到回调:", body)

    // 验证签名
    if (!verifyXunhupaySign(body)) {
      console.error("[迅虎支付] 签名验证失败")
      return NextResponse.json({ error: "签名验证失败" }, { status: 400 })
    }

    const { trade_order_id: orderNo, transaction_id: tradeNo, status, total_fee } = body

    // 只处理支付成功的通知
    if (status !== "OD") {
      return NextResponse.json({ success: false, message: "订单未完成" })
    }

    const supabase = await createServerClient()

    // 查询订单
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("order_no", orderNo)
      .single()

    if (orderError || !order) {
      console.error("[迅虎支付] 订单不存在:", orderNo)
      return NextResponse.json({ error: "订单不存在" }, { status: 404 })
    }

    // 检查订单是否已处理
    if (order.status === "paid") {
      console.log("[迅虎支付] 订单已支付，跳过处理")
      return NextResponse.json({ success: true, message: "订单已处理" })
    }

    // 更新订单状态
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "paid",
        trade_no: tradeNo,
      })
      .eq("order_no", orderNo)

    if (updateError) {
      console.error("[迅虎支付] 更新订单失败:", updateError)
      return NextResponse.json({ error: "更新订单失败" }, { status: 500 })
    }

    // 🔥 根据产品 ID 确定积分数量
    let credits = PRODUCT_CREDITS[order.product_id]
    
    // 如果产品 ID 不在映射表中，使用备用计算（1元 = 100积分）
    if (!credits) {
      credits = Math.floor(Number.parseFloat(total_fee) * 100)
      console.warn(`[迅虎支付] 产品 ${order.product_id} 不在积分映射表中，使用备用计算: ${credits} 积分`)
    }
    
    console.log(`[迅虎支付] 准备为用户 ${order.user_id} 增加 ${credits} 积分，产品: ${order.product_id}, 订单金额: ${total_fee}`)
    
    const success = await addCredits(order.user_id, credits, "purchase", `购买${order.product_name}获得${credits}积分`, order.id)

    if (!success) {
      console.error(`[迅虎支付] 增加积分失败，用户ID: ${order.user_id}, 积分: ${credits}`)
    } else {
      console.log(`[迅虎支付] 订单 ${orderNo} 支付成功，用户 ${order.user_id} 增加 ${credits} 积分`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[迅虎支付] 处理回调错误:", error)
    return NextResponse.json({ error: "处理失败" }, { status: 500 })
  }
}
