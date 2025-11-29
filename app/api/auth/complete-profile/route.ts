import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { phone, displayName } = await request.json()

    if (!phone || !displayName) {
      return NextResponse.json({ error: "缺少必要信息" }, { status: 400 })
    }

    const supabase = await createServerClient()

    // 创建用户profile
    const userId = `phone_${phone}_${Date.now()}`

    const { error } = await supabase.from("profiles").insert({
      id: userId,
      phone,
      display_name: displayName,
    })

    if (error) {
      console.error("[完善资料API] 数据库错误:", error)
    }

    // 初始化积分
    await supabase.from("user_credits").insert({
      user_id: userId,
      credits: 1000,
    })

    return NextResponse.json({
      success: true,
      message: "注册成功",
    })
  } catch (error) {
    console.error("[完善资料API] 错误:", error)
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}
