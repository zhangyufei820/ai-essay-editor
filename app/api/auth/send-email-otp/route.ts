import { type NextRequest, NextResponse } from "next/server"
import { randomInt } from "crypto"
import { emailOTPStore } from "@/lib/email-otp-store"
import { getClientIP, checkIpRateLimit, createRateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

const RESEND_TIMEOUT_MS = 15_000

// 生成6位数字验证码
function generateOTP(): string {
  return randomInt(100000, 1000000).toString()
}

// 使用 Resend 发送邮件
async function sendOTPEmail(email: string, code: string): Promise<boolean> {
  try {
    const resendApiKey = process.env.RESEND_API_KEY

    if (!resendApiKey) {
      logger.error("[email-otp] delivery configuration unavailable")
      return false
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
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    })

    if (!response.ok) {
      logger.error("[email-otp] provider request failed", { status: response.status })
      return false
    }

    return true
  } catch {
    logger.error("[email-otp] provider request failed")
    return false
  }
}

export async function POST(request: NextRequest) {
  // IP 限流：10次/分钟
  const ip = getClientIP(request)
  const limitResult = checkIpRateLimit(ip, 10)
  if (!limitResult.allowed) {
    return createRateLimitResponse(limitResult.retryAfter!)
  }

  try {
    const body: unknown = await request.json()
    const email = typeof body === "object" && body !== null && "email" in body
      ? (body as { email?: unknown }).email
      : undefined
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : ""

    if (!normalizedEmail || normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 })
    }

    // 生成验证码
    const code = generateOTP()

    let stored = false
    try {
      stored = await emailOTPStore.set(normalizedEmail, code, 5 * 60 * 1000)
    } catch {
      logger.error("[email-otp] durable challenge store unavailable")
      return NextResponse.json({ error: "验证码服务暂不可用，请稍后重试" }, { status: 503 })
    }
    if (!stored) {
      return NextResponse.json({ error: "请等待60秒后再试" }, { status: 429 })
    }

    // 发送邮件
    const emailSent = await sendOTPEmail(normalizedEmail, code)

    if (!emailSent) {
      try {
        await emailOTPStore.delete(normalizedEmail)
      } catch {
        logger.error("[email-otp] failed to remove undelivered challenge")
      }
      return NextResponse.json({ error: "邮件发送失败" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "验证码已发送到您的邮箱",
    })
  } catch {
    logger.error("[email-otp] request handling failed")
    return NextResponse.json({ error: "发送失败，请稍后重试" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 })
}
