import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { handleReferralSignup } from "@/lib/credits"
import { getPublicAppUrl } from "@/lib/public-app-url"
import { safeInternalRedirectPath } from "@/lib/security/redirect"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const publicAppUrl = getPublicAppUrl()
  const code = searchParams.get("code")
  const next = safeInternalRedirectPath(searchParams.get("next"), "/chat")
  const error = searchParams.get("error")
  const error_description = searchParams.get("error_description")

  // If Supabase returned an error
  if (error) {
    return NextResponse.redirect(
      `${publicAppUrl}/auth/error?error=${encodeURIComponent(error)}&description=${encodeURIComponent(error_description || "")}`,
    )
  }

  // Handle PKCE code exchange
  if (code) {
    const supabase = await createClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (!exchangeError) {
      try {
        const { data } = await supabase.auth.getUser()
        const referralCode = data.user?.user_metadata?.referral_code

        if (data.user?.id && typeof referralCode === "string" && referralCode.trim()) {
          const referralSuccess = await handleReferralSignup(data.user.id, referralCode.trim())
          if (referralSuccess) {
            console.log("[Auth Callback] 推荐注册奖励处理成功")
          } else {
            console.warn("[Auth Callback] 推荐注册奖励处理失败")
          }
        }
      } catch (referralError) {
        console.error("[Auth Callback] 推荐注册奖励处理异常:", referralError)
      }

      return NextResponse.redirect(`${publicAppUrl}${next}`)
    }

    // Code exchange failed
    return NextResponse.redirect(
      `${publicAppUrl}/auth/error?error=auth_callback_error&description=${encodeURIComponent(exchangeError.message)}`,
    )
  }

  // No code provided
  return NextResponse.redirect(`${publicAppUrl}/auth/error?error=missing_code`)
}
