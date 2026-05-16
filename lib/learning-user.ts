import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireUser, type VerifiedUser } from "@/lib/auth/verified-user"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isSupabaseUuid(value: string | null | undefined) {
  return Boolean(value && UUID_PATTERN.test(value))
}

function normalizePhone(value?: string | null) {
  return String(value || "").replace(/\D/g, "")
}

function syntheticEmailForUser(userId: string) {
  return `authing-${userId}@users.shenxiang.local`
}

async function findUserByEmail(supabase: SupabaseClient, email?: string | null) {
  if (!email) return null
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) || null
}

async function findUserByAuthingProfile(supabase: SupabaseClient, verifiedUser: VerifiedUser) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  return data.users.find((supabaseUser) => {
    return supabaseUser.user_metadata?.authing_user_id === verifiedUser.id
  }) || null
}

async function saveUserMapping(supabase: SupabaseClient, user: VerifiedUser, supabaseUserId: string) {
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
  const syntheticEmail = syntheticEmailForUser(user.id)
  const existingByEmail = await findUserByEmail(supabase, syntheticEmail)
  if (existingByEmail?.id) {
    await saveUserMapping(supabase, user, existingByEmail.id)
    return existingByEmail.id
  }

  const existingByMetadata = await findUserByAuthingProfile(supabase, user)
  if (existingByMetadata?.id) {
    await saveUserMapping(supabase, user, existingByMetadata.id)
    return existingByMetadata.id
  }

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

  await saveUserMapping(supabase, user, data.user.id)
  return data.user.id
}

export async function requireLearningUserId(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth.response) return { userId: null, auth, response: auth.response }

  const userId = await resolveLearningUserId(auth.user!)
  return { userId, auth, response: null }
}
