import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { verifyXunhupaySign } from "@/lib/xunhupay"
import { addCredits } from "@/lib/credits"

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
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("order_no", orderNo)

    if (updateError) {
      console.error("[迅虎支付] 更新订单失败:", updateError)
      return NextResponse.json({ error: "更新订单失败" }, { status: 500 })
    }

    // 计算并增加积分（假设1元 = 100积分）
    const credits = Math.floor(Number.parseFloat(total_fee) * 100)
    const success = await addCredits(order.user_id, credits, "purchase", `购买${order.product_name}获得积分`, order.id)

    if (!success) {
      console.error("[迅虎支付] 增加积分失败")
    }

    console.log(`[迅虎支付] 订单 ${orderNo} 支付成功，增加 ${credits} 积分`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[迅虎支付] 处理回调错误:", error)
    return NextResponse.json({ error: "处理失败" }, { status: 500 })
  }
}
