import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const { orderNo } = await params
    const supabase = await createServerClient()

    const { data: order } = await supabase.from("orders").select("*").eq("order_no", orderNo).single()

    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 })
    }

    return NextResponse.json({
      status: order.status,
      orderNo: order.order_no,
      amount: order.amount,
      paidAt: order.paid_at,
    })
  } catch (error) {
    console.error("[查询订单状态] 错误:", error)
    return NextResponse.json({ error: "查询失败" }, { status: 500 })
  }
}
