import { extractUserId } from "@/lib/auth-user"
import { createClient } from "@/lib/supabase/client"

function getStoredAuthingToken() {
  if (typeof window === "undefined") return null
  return localStorage.getItem("idToken") || localStorage.getItem("authingToken") || localStorage.getItem("accessToken")
}

function isAuthingUserId(user: unknown) {
  return /^[a-f0-9]{24}$/i.test(extractUserId(user))
}

export async function getVerifiedAuthHeaders(currentUser?: unknown): Promise<Record<string, string>> {
  const authingToken = getStoredAuthingToken()
  if (authingToken && isAuthingUserId(currentUser)) {
    return { Authorization: `Bearer ${authingToken}` }
  }

  const supabase = createClient()
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    if (data.session?.access_token) {
      return { Authorization: `Bearer ${data.session.access_token}` }
    }
  }

  return authingToken ? { Authorization: `Bearer ${authingToken}` } : {}
}
