import type { EmailOtpType } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"
import { handleReferralSignup } from "@/lib/credits"
import { createClient } from "@/lib/supabase/server"
import { safeInternalRedirectPath } from "@/lib/security/redirect"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const next = safeInternalRedirectPath(searchParams.get("next"), "/chat")

  const redirectTo = request.nextUrl.clone()
  redirectTo.pathname = next
  redirectTo.searchParams.delete("token_hash")
  redirectTo.searchParams.delete("type")

  if (token_hash && type) {
    const supabase = await createClient()

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })
    if (!error) {
      try {
        const { data } = await supabase.auth.getUser()
        const referralCode = data.user?.user_metadata?.referral_code
        if (data.user?.id && typeof referralCode === "string" && referralCode.trim()) {
          await handleReferralSignup(data.user.id, referralCode.trim())
        }
      } catch (referralError) {
        console.error("[Auth Confirm] 推荐注册奖励处理异常:", referralError)
      }

      redirectTo.searchParams.delete("next")
      return NextResponse.redirect(redirectTo)
    }
  }

  // 验证失败，重定向到错误页面
  redirectTo.pathname = "/auth/error"
  redirectTo.searchParams.set("error", "verification_failed")
  return NextResponse.redirect(redirectTo)
}
