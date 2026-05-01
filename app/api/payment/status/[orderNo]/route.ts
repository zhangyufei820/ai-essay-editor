import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

type PaymentStatus = "pending" | "paid" | "failed" | "cancelled" | string

function normalizeStatus(status: PaymentStatus) {
  if (status === "paid") return "paid"
  if (status === "failed" || status === "cancelled" || status === "closed") return "failed"
  return "pending"
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const { orderNo } = await params

    if (!orderNo) {
      return NextResponse.json({ error: "缺少订单号" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 })
    }

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, order_no, user_id, product_name, amount, credits_amount, status, created_at, updated_at")
      .eq("order_no", orderNo)
      .eq("user_id", user.id)
      .maybeSingle()

    if (error) {
      console.error("[查询订单状态] 数据库错误:", error)
      return NextResponse.json({ error: "查询失败" }, { status: 500 })
    }

    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 })
    }

    const normalizedStatus = normalizeStatus(order.status)

    return NextResponse.json({
      status: normalizedStatus,
      rawStatus: order.status,
      orderNo: order.order_no,
      productName: order.product_name,
      amount: order.amount,
      creditsAmount: order.credits_amount,
      createdAt: order.created_at,
      paidAt: normalizedStatus === "paid" ? order.updated_at : null,
      updatedAt: order.updated_at,
      message:
        normalizedStatus === "paid"
          ? "支付成功，权益已到账"
          : normalizedStatus === "failed"
            ? "支付未完成或已关闭"
            : "等待支付结果确认",
    })
  } catch (error) {
    console.error("[查询订单状态] 错误:", error)
    return NextResponse.json({ error: "查询失败" }, { status: 500 })
  }
}
