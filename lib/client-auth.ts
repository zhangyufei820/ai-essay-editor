import { extractUserId } from "@/lib/auth-user"
import { createClient } from "@/lib/supabase/client"

type TokenCandidate = {
  key: string
  value: string
  priority: number
}

const AUTHING_SDK_TOKEN_KEY = "_authing_token"
const AUTHING_SDK_USER_KEY = "_authing_user"
const AUTH_TOKEN_STORAGE_KEYS = [
  "idToken",
  "authingToken",
  "accessToken",
  AUTHING_SDK_TOKEN_KEY,
] as const
const SUPABASE_AUTH_TOKEN_SUFFIX = "-auth-token"
const SUPABASE_SESSION_TIMEOUT_MS = 1200
export const AUTH_REQUIRED_MESSAGE = "登录状态已过期，请重新登录后再上传文件。"

function isUsableToken(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value !== "null" && value !== "undefined"
}

function looksLikeJwt(value: unknown): value is string {
  return isUsableToken(value) && value.split(".").length === 3
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

function collectTokenCandidates(value: unknown, candidates: TokenCandidate[] = [], key = "") {
  if (!value || typeof value !== "object") return candidates

  const record = value as Record<string, unknown>
  for (const [childKey, childValue] of Object.entries(record)) {
    const path = key ? `${key}.${childKey}` : childKey
    const normalizedKey = childKey.toLowerCase().replace(/[_-]/g, "")

    if (isUsableToken(childValue)) {
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
                : normalizedKey.endsWith("token")
                  ? 5
                  : 6
      if (priority < 6) candidates.push({ key: path, value: childValue, priority })
    } else if (childValue && typeof childValue === "object") {
      collectTokenCandidates(childValue, candidates, path)
    }
  }

  return candidates
}

function parseStoredJson(key: string) {
  if (typeof window === "undefined") return null
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function readStoredToken(key: string) {
  if (typeof window === "undefined") return null
  const value = localStorage.getItem(key)
  return isUsableToken(value) ? value : null
}

function getSupabaseProjectRef() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return null

  try {
    return new URL(supabaseUrl).hostname.split(".")[0] || null
  } catch {
    return null
  }
}

function getSupabaseAuthStorageKeys() {
  if (typeof window === "undefined") return []

  const keys = new Set<string>()
  const projectRef = getSupabaseProjectRef()
  if (projectRef) keys.add(`sb-${projectRef}${SUPABASE_AUTH_TOKEN_SUFFIX}`)

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key?.startsWith("sb-") && key.endsWith(SUPABASE_AUTH_TOKEN_SUFFIX)) {
      keys.add(key)
    }
  }

  return Array.from(keys)
}

function pickSupabaseAccessToken(value: unknown) {
  if (!value || typeof value !== "object") return null

  const candidates = collectTokenCandidates(value)
    .filter((candidate) => {
      const normalizedKey = candidate.key.toLowerCase().replace(/[_-]/g, "")
      return normalizedKey.endsWith("accesstoken") || normalizedKey.endsWith("token")
    })
    .sort((a, b) => a.priority - b.priority)

  return candidates.find((candidate) => looksLikeJwt(candidate.value))?.value || null
}

function getStoredSupabaseAccessToken() {
  if (typeof window === "undefined") return null

  for (const key of getSupabaseAuthStorageKeys()) {
    const parsed = parseStoredJson(key)
    const token = pickSupabaseAccessToken(parsed)
    if (token) return token
  }

  return null
}

async function getSupabaseSessionAccessTokenWithTimeout() {
  const supabase = createClient()
  if (!supabase) return null

  let timeoutId: ReturnType<typeof setTimeout> | null = null
  try {
    const timeout = new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => resolve(null), SUPABASE_SESSION_TIMEOUT_MS)
    })
    const session = supabase.auth
      .getSession()
      .then(({ data }) => data.session?.access_token || null)
      .catch(() => null)

    return await Promise.race([session, timeout])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function pickJwtFromStoredUser() {
  const storedCurrentUser = getStoredCurrentUser()
  const storedAuthingUser = getStoredAuthingSdkUser()
  const [candidate] = collectJwtCandidates({
    currentUser: storedCurrentUser,
    authingSdkUser: storedAuthingUser,
  })
    .sort((a, b) => a.priority - b.priority)
  return looksLikeJwt(candidate?.value) ? candidate.value : null
}

function pickTokenFromStoredUser() {
  const storedCurrentUser = getStoredCurrentUser()
  const storedAuthingUser = getStoredAuthingSdkUser()
  const [candidate] = collectTokenCandidates({
    currentUser: storedCurrentUser,
    authingSdkUser: storedAuthingUser,
  })
    .sort((a, b) => a.priority - b.priority)
  return isUsableToken(candidate?.value) ? candidate.value : null
}

function getStoredAuthingToken() {
  if (typeof window === "undefined") return null
  return (
    readStoredToken("idToken") ||
    pickJwtFromStoredUser() ||
    readStoredToken("authingToken") ||
    readStoredToken("accessToken") ||
    pickTokenFromStoredUser() ||
    readStoredToken(AUTHING_SDK_TOKEN_KEY)
  )
}

function isAuthingUserId(user: unknown) {
  return /^[a-f0-9]{24}$/i.test(extractUserId(user))
}

function getStoredCurrentUser() {
  return parseStoredJson("currentUser")
}

function getStoredAuthingSdkUser() {
  return parseStoredJson(AUTHING_SDK_USER_KEY)
}

export async function getVerifiedAuthHeaders(currentUser?: unknown): Promise<Record<string, string>> {
  const authingToken =
    collectTokenCandidates(currentUser).sort((a, b) => a.priority - b.priority)[0]?.value ||
    getStoredAuthingToken()
  const storedCurrentUser = getStoredCurrentUser()
  const storedAuthingUser = getStoredAuthingSdkUser()
  if (authingToken && (isAuthingUserId(currentUser) || isAuthingUserId(storedCurrentUser) || isAuthingUserId(storedAuthingUser))) {
    return { Authorization: `Bearer ${authingToken}` }
  }

  const supabaseStoredAccessToken = getStoredSupabaseAccessToken()
  if (supabaseStoredAccessToken) {
    return { Authorization: `Bearer ${supabaseStoredAccessToken}` }
  }

  const liveSupabaseAccessToken = await getSupabaseSessionAccessTokenWithTimeout()
  if (liveSupabaseAccessToken) {
    return { Authorization: `Bearer ${liveSupabaseAccessToken}` }
  }

  return authingToken ? { Authorization: `Bearer ${authingToken}` } : {}
}

export async function getRequiredAuthHeaders(currentUser?: unknown): Promise<Record<string, string>> {
  const headers = await getVerifiedAuthHeaders(currentUser)
  if (headers.Authorization) return headers

  const error = new Error(AUTH_REQUIRED_MESSAGE)
  error.name = "AuthRequiredError"
  throw error
}

export function hasStoredVerifiedAuthToken() {
  if (typeof window === "undefined") return false
  return Boolean(
    getStoredAuthingToken() ||
    getStoredSupabaseAccessToken() ||
    AUTH_TOKEN_STORAGE_KEYS.some((key) => readStoredToken(key)),
  )
}

export function clearStoredAuthTokens() {
  if (typeof window === "undefined") return
  for (const key of AUTH_TOKEN_STORAGE_KEYS) {
    window.localStorage.removeItem(key)
  }
  for (const key of getSupabaseAuthStorageKeys()) {
    window.localStorage.removeItem(key)
  }
  window.localStorage.removeItem(AUTHING_SDK_USER_KEY)
}

export function clearStoredAuthState() {
  if (typeof window === "undefined") return
  clearStoredAuthTokens()
  window.localStorage.removeItem("currentUser")
}
