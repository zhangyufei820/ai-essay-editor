import { extractUserId } from "@/lib/auth-user"
import { createClient } from "@/lib/supabase/client"

type TokenCandidate = {
  key: string
  value: string
  priority: number
}

function looksLikeJwt(value: unknown): value is string {
  return typeof value === "string" && value.split(".").length === 3
}

function collectJwtCandidates(value: unknown, candidates: TokenCandidate[] = [], key = "") {
  if (!value || typeof value !== "object") return candidates

  const record = value as Record<string, unknown>
  for (const [childKey, childValue] of Object.entries(record)) {
    const path = key ? `${key}.${childKey}` : childKey
    const normalizedKey = childKey.toLowerCase().replace(/[_-]/g, "")

    if (looksLikeJwt(childValue)) {
      const priority = normalizedKey === "idtoken"
        ? 0
        : normalizedKey === "token"
          ? 1
          : normalizedKey === "authtoken"
            ? 2
            : normalizedKey === "authingtoken"
              ? 3
              : normalizedKey === "accesstoken"
                ? 4
                : 5
      candidates.push({ key: path, value: childValue, priority })
    } else if (childValue && typeof childValue === "object") {
      collectJwtCandidates(childValue, candidates, path)
    }
  }

  return candidates
}

function pickJwtFromStoredUser() {
  const storedCurrentUser = getStoredCurrentUser()
  const [candidate] = collectJwtCandidates(storedCurrentUser)
    .sort((a, b) => a.priority - b.priority)
  return looksLikeJwt(candidate?.value) ? candidate.value : null
}

function getStoredAuthingToken() {
  if (typeof window === "undefined") return null
  return (
    localStorage.getItem("idToken") ||
    pickJwtFromStoredUser() ||
    localStorage.getItem("authingToken") ||
    localStorage.getItem("accessToken")
  )
}

function isAuthingUserId(user: unknown) {
  return /^[a-f0-9]{24}$/i.test(extractUserId(user))
}

function getStoredCurrentUser() {
  if (typeof window === "undefined") return null
  try {
    return JSON.parse(localStorage.getItem("currentUser") || "null")
  } catch {
    return null
  }
}

export async function getVerifiedAuthHeaders(currentUser?: unknown): Promise<Record<string, string>> {
  const authingToken =
    collectJwtCandidates(currentUser).sort((a, b) => a.priority - b.priority)[0]?.value ||
    getStoredAuthingToken()
  const storedCurrentUser = getStoredCurrentUser()
  if (authingToken && (isAuthingUserId(currentUser) || isAuthingUserId(storedCurrentUser))) {
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
