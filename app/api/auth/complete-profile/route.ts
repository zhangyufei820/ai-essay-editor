import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { handleReferralSignup, createUserReferralCode } from "@/lib/credits"

export async function POST(request: NextRequest) {
  try {
    const { phone, displayName, referralCode } = await request.json()

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

    // 🔥 为新用户创建推荐码
    try {
      await createUserReferralCode(userId)
      console.log(`[完善资料API] 用户 ${userId} 推荐码创建成功`)
    } catch (e) {
      console.error("[完善资料API] 推荐码创建失败:", e)
    }

    // 🔥 处理推荐注册（如果有推荐码）
    if (referralCode) {
      try {
        const success = await handleReferralSignup(userId, referralCode)
        if (success) {
          console.log(`[完善资料API] 推荐注册处理成功，用户 ${userId}`)
        } else {
          console.log(`[完善资料API] 推荐码无效或处理失败: ${referralCode}`)
        }
      } catch (e) {
        console.error("[完善资料API] 推荐注册处理异常:", e)
      }
    }

    return NextResponse.json({
      success: true,
      message: "注册成功",
    })
  } catch (error) {
    console.error("[完善资料API] 错误:", error)
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}
