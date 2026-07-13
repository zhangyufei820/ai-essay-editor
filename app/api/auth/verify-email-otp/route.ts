import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { emailOTPStore } from "@/lib/email-otp-store"
import { getClientIP, checkIpRateLimit, createRateLimitResponse } from "@/lib/rate-limit"
import { handleReferralSignup } from "@/lib/credits"
import { createServerClient } from "@/lib/supabase/server"
import { findAuthUserIdByEmail } from "@/lib/auth/find-user-by-email"
import { logger } from "@/lib/logger"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
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
    const code = typeof body === "object" && body !== null && "code" in body
      ? (body as { code?: unknown }).code
      : undefined
    const referralCodeValue = typeof body === "object" && body !== null && "referralCode" in body
      ? (body as { referralCode?: unknown }).referralCode
      : undefined
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : ""
    const normalizedCode = typeof code === "string" ? code.trim() : ""
    const referralCode = typeof referralCodeValue === "string" && referralCodeValue.length <= 100
      ? referralCodeValue.trim()
      : ""

    if (!normalizedEmail || normalizedEmail.length > 254 || !EMAIL_PATTERN.test(normalizedEmail) || !/^\d{6}$/.test(normalizedCode)) {
      return NextResponse.json({ error: "邮箱或验证码格式不正确" }, { status: 400 })
    }

    let verificationResult
    try {
      verificationResult = await emailOTPStore.verify(normalizedEmail, normalizedCode)
    } catch {
      logger.error("[email-otp] durable challenge verification unavailable")
      return NextResponse.json({ error: "验证码服务暂不可用，请稍后重试" }, { status: 503 })
    }

    if (verificationResult === "too_many_attempts") {
      return NextResponse.json({ error: "验证次数过多，请重新获取验证码" }, { status: 400 })
    }
    if (verificationResult === "expired" || verificationResult === "missing") {
      return NextResponse.json({ error: "验证码不存在或已过期" }, { status: 400 })
    }
    if (verificationResult !== "valid") {
      return NextResponse.json({ error: "验证码错误" }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      logger.error("[email-otp] Supabase configuration unavailable")
      return NextResponse.json({ error: "服务配置错误" }, { status: 500 })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    let userId: string | undefined
    try {
      userId = await findAuthUserIdByEmail(supabaseAdmin, normalizedEmail)
    } catch {
      logger.error("[email-otp] auth user lookup unavailable")
      return NextResponse.json({ error: "登录服务暂不可用，请稍后重试" }, { status: 503 })
    }

    if (!userId) {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: true,
        user_metadata: {
          display_name: normalizedEmail.split("@")[0],
          ...(referralCode ? { referral_code: referralCode } : {}),
        },
      })

      if (createError) {
        try {
          userId = await findAuthUserIdByEmail(supabaseAdmin, normalizedEmail)
        } catch {
          userId = undefined
        }
        if (!userId) {
          logger.error("[email-otp] user creation failed", { code: createError.code })
          return NextResponse.json({ error: "创建用户失败，请稍后重试" }, { status: 500 })
        }
      } else {
        userId = newUser.user?.id

        if (userId) {
          try {
            const { getUserCredits, createUserReferralCode } = await import("@/lib/credits")

            // getUserCredits 会为缺失记录创建 1000 积分且 is_pro=false。
            await getUserCredits(userId)
            await createUserReferralCode(userId)

            if (referralCode) {
              await handleReferralSignup(userId, referralCode)
            }
          } catch (creditsError) {
            logger.error("[email-otp] post-signup initialization failed", { error: creditsError })
          }
        }
      }
    }

    if (!userId) {
      return NextResponse.json({ error: "登录失败，请重试" }, { status: 500 })
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.shenxiang.school"}/auth/callback`,
      },
    })

    if (linkError) {
      logger.error("[email-otp] session link generation failed", { code: linkError.code })
      return NextResponse.json({ error: "登录失败，请重试" }, { status: 500 })
    }

    const tokenHash = linkData.properties?.hashed_token
    if (!tokenHash) {
      return NextResponse.json({ error: "登录失败，请重试" }, { status: 500 })
    }

    const supabase = await createServerClient()
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    })

    if (verifyError) {
      logger.error("[email-otp] server session establishment failed", { code: verifyError.code })
      return NextResponse.json({ error: "登录失败，请重试" }, { status: 500 })
    }

    logger.info("[email-otp] session established")
    return NextResponse.json({
      success: true,
      message: "验证成功",
      needsEmailConfirmation: false,
    })
  } catch (error: unknown) {
    logger.error("[email-otp] verification request failed", { error })
    return NextResponse.json({ error: "验证失败，请稍后重试" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 })
}
