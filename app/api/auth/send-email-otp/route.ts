import { type NextRequest, NextResponse } from "next/server"
import { emailOTPStore } from "@/lib/email-otp-store"

// 生成6位数字验证码
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// 发送邮件（开发模式直接返回验证码，生产模式使用 Resend）
async function sendOTPEmail(email: string, code: string): Promise<{ success: boolean; devCode?: string }> {
  const isDev = process.env.NODE_ENV === "development"

  if (isDev) {
    // 开发模式：直接返回验证码
    console.log(`[开发模式] 验证码: ${code}`)
    return { success: true, devCode: code }
  }

  // 生产模式：使用 Resend 发送邮件
  try {
    const resendApiKey = process.env.RESEND_API_KEY

    if (!resendApiKey) {
      console.warn("未配置 RESEND_API_KEY，返回验证码供测试")
      return { success: true, devCode: code }
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "noreply@shenxiang.school",
        to: email,
        subject: "您的登录验证码",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">登录验证码</h2>
            <p style="font-size: 16px; color: #666;">您的验证码是：</p>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${code}</span>
            </div>
            <p style="font-size: 14px; color: #999;">验证码5分钟内有效，请勿泄露给他人。</p>
          </div>
        `,
      }),
    })

    if (!response.ok) {
      console.error("Resend API 错误:", await response.text())
      return { success: false }
    }

    return { success: true }
  } catch (error) {
    console.error("发送邮件失败:", error)
    return { success: false }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase()

    if (!emailOTPStore.canSend(normalizedEmail)) {
      return NextResponse.json({ error: "请等待60秒后再试" }, { status: 429 })
    }

    // 生成验证码
    const code = generateOTP()

    // 存储验证码（5分钟有效期）
    emailOTPStore.set(normalizedEmail, code, 5 * 60 * 1000)

    // 发送邮件
    const emailResult = await sendOTPEmail(normalizedEmail, code)

    if (!emailResult.success && !emailResult.devCode) {
      return NextResponse.json({ error: "邮件发送失败" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "验证码已发送到您的邮箱",
      devCode: emailResult.devCode, // 仅开发模式返回
    })
  } catch (error: any) {
    console.error("发送验证码失败:", error)
    return NextResponse.json({ error: error.message || "发送失败" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 })
}
