import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/chat"
  const error = searchParams.get("error")
  const error_description = searchParams.get("error_description")

  // If Supabase returned an error
  if (error) {
    return NextResponse.redirect(
      `${origin}/auth/error?error=${encodeURIComponent(error)}&description=${encodeURIComponent(error_description || "")}`,
    )
  }

  // Handle PKCE code exchange
  if (code) {
    const supabase = await createClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (!exchangeError) {
      return NextResponse.redirect(`${origin}${next}`)
    }

    // Code exchange failed
    return NextResponse.redirect(
      `${origin}/auth/error?error=auth_callback_error&description=${encodeURIComponent(exchangeError.message)}`,
    )
  }

  // No code provided
  return NextResponse.redirect(`${origin}/auth/error?error=missing_code`)
}
