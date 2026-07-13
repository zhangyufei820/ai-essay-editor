import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireUser, type VerifiedUser } from "@/lib/auth/verified-user"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ADMIN_USERS_PAGE_SIZE = 1000
const MAX_ADMIN_USER_PAGES = 100

export function isSupabaseUuid(value: string | null | undefined) {
  return Boolean(value && UUID_PATTERN.test(value))
}

function normalizePhone(value?: string | null) {
  return String(value || "").replace(/\D/g, "")
}

function syntheticEmailForUser(userId: string) {
  return `authing-${userId}@users.shenxiang.local`
}

async function findBridgedUser(supabase: SupabaseClient, verifiedUser: VerifiedUser) {
  const syntheticEmail = syntheticEmailForUser(verifiedUser.id).toLowerCase()

  for (let page = 1; page <= MAX_ADMIN_USER_PAGES; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: ADMIN_USERS_PAGE_SIZE })
    if (error) throw error
    const match = data.users.find((user) => (
      user.email?.toLowerCase() === syntheticEmail ||
      user.user_metadata?.authing_user_id === verifiedUser.id
    ))
    if (match) return match
    if (data.users.length < ADMIN_USERS_PAGE_SIZE) return null
  }

  throw new Error("学习用户目录超过可安全扫描范围")
}

async function saveAuthingProfile(supabase: SupabaseClient, user: VerifiedUser) {
  const payload = {
    user_id: user.id,
    email: user.email || syntheticEmailForUser(user.id),
    phone: user.phone || null,
    nickname: user.email || user.phone || "学习用户",
  }

  const { error } = await supabase
    .from("user_profiles")
    .upsert(payload, { onConflict: "user_id" })

  if (error) {
    console.warn("[LearningUser] 保存 Authing/Supabase 映射失败:", error.message)
  }
}

export async function resolveLearningUserId(user: VerifiedUser): Promise<string> {
  if (isSupabaseUuid(user.id)) return user.id

  const supabase = getSupabaseAdmin()
  const existingUser = await findBridgedUser(supabase, user)
  if (existingUser?.id) {
    await saveAuthingProfile(supabase, user)
    return existingUser.id
  }

  const syntheticEmail = syntheticEmailForUser(user.id)
  const { data, error } = await supabase.auth.admin.createUser({
    email: syntheticEmail,
    email_confirm: true,
    password: randomUUID(),
    user_metadata: {
      authing_user_id: user.id,
      authing_email: user.email || null,
      phone: user.phone || null,
      phone_digits: normalizePhone(user.phone),
      source: "authing-learning-bridge",
    },
  })

  if (error) throw error
  if (!data.user?.id) throw new Error("创建学习用户失败")

  await saveAuthingProfile(supabase, user)
  return data.user.id
}

export async function requireLearningUserId(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth.response) return { userId: null, auth, response: auth.response }

  const userId = await resolveLearningUserId(auth.user!)
  return { userId, auth, response: null }
}
