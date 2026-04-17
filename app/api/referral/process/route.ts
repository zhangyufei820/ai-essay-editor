import { handleReferralSignup } from "@/lib/credits"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    // IP 限流：30次/分钟
    const { getClientIP, checkIpRateLimit, createRateLimitResponse } = await import('@/lib/rate-limit')
    const ip = getClientIP(request)
    const limitResult = checkIpRateLimit(ip, 30)
    if (!limitResult.allowed) {
      return createRateLimitResponse(limitResult.retryAfter!)
    }
    const { userId, referralCode } = await request.json()

    if (!userId || !referralCode) {
      return NextResponse.json({ error: "Missing userId or referralCode" }, { status: 400 })
    }

    console.log(`[推荐处理] 处理推荐注册: userId=${userId}, referralCode=${referralCode}`)

    const success = await handleReferralSignup(userId, referralCode)

    if (success) {
      // 🔥 增加推荐码的使用次数
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        
        // 先获取当前的 uses 值
        const { data: codeData, error: fetchError } = await supabase
          .from("referral_codes")
          .select("uses")
          .eq("code", referralCode)
          .single()
        
        if (!fetchError && codeData) {
          const currentUses = codeData.uses || 0
          const { error: updateError } = await supabase
            .from("referral_codes")
            .update({ uses: currentUses + 1 })
            .eq("code", referralCode)
          
          if (updateError) {
            console.log(`[推荐处理] 更新推荐码使用次数失败（非关键）:`, updateError)
          } else {
            console.log(`[推荐处理] 推荐码使用次数已更新: ${currentUses} -> ${currentUses + 1}`)
          }
        }
      } catch (e) {
        console.log(`[推荐处理] 更新推荐码使用次数异常（非关键）:`, e)
      }

      return NextResponse.json({ success: true, message: "推荐注册成功，双方都获得了积分奖励！" })
    } else {
      console.log(`[推荐处理] 推荐码无效或处理失败`)
      return NextResponse.json({ error: "Invalid referral code" }, { status: 400 })
    }
  } catch (error) {
    console.error("[推荐处理] 错误:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
