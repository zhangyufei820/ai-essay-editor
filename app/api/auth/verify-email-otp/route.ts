import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { emailOTPStore } from "@/lib/email-otp-store"

export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json()

    if (!email || !code) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase()
    const normalizedCode = code.trim()

    console.log(`[v0] 验证请求: email=${normalizedEmail}, code=${normalizedCode}`)

    const otpData = emailOTPStore.get(normalizedEmail)

    if (!otpData) {
      console.log(`[v0] 验证失败: 验证码不存在`)
      return NextResponse.json({ error: "验证码不存在或已过期" }, { status: 400 })
    }

    // 检查尝试次数
    if (otpData.attempts >= 5) {
      emailOTPStore.delete(normalizedEmail)
      return NextResponse.json({ error: "验证次数过多，请重新获取验证码" }, { status: 400 })
    }

    // 验证码不匹配
    if (otpData.code !== normalizedCode) {
      console.log(`[v0] 验证码不匹配: 期望 ${otpData.code}, 收到 ${normalizedCode}`)
      emailOTPStore.incrementAttempts(normalizedEmail)
      return NextResponse.json({ error: "验证码错误" }, { status: 400 })
    }

    console.log(`[v0] 验证码匹配成功`)

    const supabase = await createClient()

    // Send Supabase OTP to create/login user
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
        data: {
          display_name: normalizedEmail.split("@")[0],
        },
      },
    })

    if (otpError) {
      console.error("[v0] Supabase OTP error:", otpError)
      // Don't delete the code yet, let user retry
      return NextResponse.json({ error: "登录失败，请重试" }, { status: 500 })
    }

    emailOTPStore.delete(normalizedEmail)
    console.log(`[v0] 验证码已删除，等待用户点击邮件链接`)

    return NextResponse.json({
      success: true,
      message: "验证成功，请检查邮箱并点击确认链接",
      needsEmailConfirmation: true,
    })
  } catch (error: any) {
    console.error("[v0] 验证异常:", error)
    return NextResponse.json({ error: error.message || "验证失败" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 })
}
