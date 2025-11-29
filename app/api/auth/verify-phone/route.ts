import { type NextRequest, NextResponse } from "next/server"
import { verificationStore } from "@/lib/verification-store"
import { createServerClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { phone, code } = await request.json()

    // 验证验证码
    const isValid = verificationStore.verify(phone, code)

    if (!isValid) {
      return NextResponse.json({ error: "验证码错误或已过期" }, { status: 400 })
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json({
        success: true,
        message: "验证成功（数据库未配置）",
      })
    }

    // 验证成功，创建或登录用户
    const supabase = await createServerClient()

    // 检查用户是否存在
    const { data: existingUser } = await supabase.from("profiles").select("*").eq("phone", phone).single()

    if (existingUser) {
      // 用户已存在，直接登录
      // 这里需要创建一个session
      // Supabase不直接支持手机号登录，需要使用自定义token
      return NextResponse.json({
        success: true,
        user: existingUser,
        message: "登录成功",
      })
    } else {
      // 新用户，需要完善信息
      return NextResponse.json({
        success: true,
        isNewUser: true,
        phone,
        message: "验证成功，请完善个人信息",
      })
    }
  } catch (error) {
    console.error("[验证API] 错误:", error)
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}
