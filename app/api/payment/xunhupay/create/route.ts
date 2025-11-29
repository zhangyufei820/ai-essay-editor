import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { createXunhupayOrder } from "@/lib/xunhupay"
import { PRODUCTS } from "@/lib/products"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const productId = searchParams.get("productId")
    const paymentType = (searchParams.get("type") || "alipay") as "alipay" | "wechat"

    if (!productId) {
      return NextResponse.json({ error: "缺少产品ID" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(new URL("/auth/login", request.url))
    }

    const product = PRODUCTS.find((p) => p.id === productId)

    if (!product) {
      return NextResponse.json({ error: "产品不存在" }, { status: 404 })
    }

    // 生成订单号
    const orderNo = `XH${Date.now()}${Math.random().toString(36).substring(2, 9).toUpperCase()}`

    // 创建订单记录
    const { error: orderError } = await supabase.from("orders").insert({
      order_no: orderNo,
      user_id: user.id,
      product_id: product.id,
      product_name: product.name,
      amount: product.priceInCents / 100,
      payment_method: `xunhupay_${paymentType}`,
      status: "pending",
    })

    if (orderError) {
      console.error("[迅虎支付] 创建订单失败:", orderError)
      return NextResponse.json({ error: "创建订单失败" }, { status: 500 })
    }

    // 生成支付URL
    const paymentUrl = createXunhupayOrder({
      outTradeNo: orderNo,
      totalAmount: (product.priceInCents / 100).toFixed(2),
      subject: product.name,
      body: product.description,
      paymentType,
    })

    // 重定向到支付页面
    return NextResponse.redirect(paymentUrl)
  } catch (error) {
    console.error("[迅虎支付] 创建订单错误:", error)
    return NextResponse.json({ error: "系统错误" }, { status: 500 })
  }
}
