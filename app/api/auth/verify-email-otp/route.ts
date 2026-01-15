import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
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

    // 🔥 使用 Admin API 直接创建/登录用户，无需发送第二封邮件
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[v0] 缺少 Supabase 配置")
      return NextResponse.json({ error: "服务配置错误" }, { status: 500 })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // 检查用户是否已存在
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    
    let userId: string | undefined
    const existingUser = existingUsers?.users.find(u => u.email === normalizedEmail)
    
    if (existingUser) {
      // 用户已存在，直接获取 ID
      userId = existingUser.id
      console.log(`[v0] 用户已存在: ${userId}`)
    } else {
      // 创建新用户（自动确认邮箱）
      console.log(`[v0] 创建新用户: ${normalizedEmail}`)
      
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: true, // 🔥 自动确认邮箱，无需再发确认邮件
        user_metadata: {
          display_name: normalizedEmail.split("@")[0],
        },
      })

      if (createError) {
        console.error("[v0] 创建用户失败:", createError)
        return NextResponse.json({ error: "创建用户失败: " + createError.message }, { status: 500 })
      }

      userId = newUser.user?.id
      console.log(`[v0] 新用户创建成功: ${userId}`)
      
      // 🎁 给新用户发放注册积分（如果需要）
      if (userId) {
        try {
          const { addCredits } = await import("@/lib/credits")
          await addCredits(userId, 1000, "signup_bonus", "🎉 注册成功，获得 1000 积分新人礼包")
          console.log(`[v0] 新用户积分发放成功`)
        } catch (creditsError) {
          console.error("[v0] 积分发放失败:", creditsError)
          // 不影响登录流程
        }
      }
    }

    // 🔥 生成登录链接（Magic Link），直接在当前窗口完成登录
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.shenxiang.school'}/auth/callback`,
      }
    })

    if (linkError) {
      console.error("[v0] 生成登录链接失败:", linkError)
      return NextResponse.json({ error: "登录失败，请重试" }, { status: 500 })
    }

    emailOTPStore.delete(normalizedEmail)
    console.log(`[v0] 验证成功，返回登录链接`)

    // 🔥 返回登录链接给前端，前端跳转完成登录
    return NextResponse.json({
      success: true,
      message: "验证成功",
      // 返回登录链接中的 token 部分
      redirectUrl: linkData.properties?.action_link || null,
      needsEmailConfirmation: false,
    })
  } catch (error: any) {
    console.error("[v0] 验证异常:", error)
    return NextResponse.json({ error: error.message || "验证失败" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 })
}
