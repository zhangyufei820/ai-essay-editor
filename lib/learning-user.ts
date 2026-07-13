import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { NextRequest } from "next/server"

import { requireUser, type VerifiedUser } from "@/lib/auth/verified-user"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const AUTHING_PROVIDER = "authing"

export function isSupabaseUuid(value: string | null | undefined) {
  return Boolean(value && UUID_PATTERN.test(value))
}

function normalizePhone(value?: string | null) {
  return String(value || "").replace(/\D/g, "")
}

function syntheticEmailForUser(userId: string) {
  return `authing-${userId}@users.shenxiang.local`
}

async function findBridgedUserId(supabase: SupabaseClient, providerUserId: string) {
  const { data, error } = await supabase
    .from("auth_user_bridges")
    .select("supabase_user_id")
    .eq("provider", AUTHING_PROVIDER)
    .eq("provider_user_id", providerUserId)
    .maybeSingle()

  if (error) throw error
  return typeof data?.supabase_user_id === "string" ? data.supabase_user_id : null
}

async function saveAuthingProfile(supabase: SupabaseClient, supabaseUserId: string, user: VerifiedUser) {
  const payload = {
    user_id: supabaseUserId,
    email: user.email || syntheticEmailForUser(user.id),
    phone: user.phone || null,
    nickname: user.email || user.phone || "学习用户",
  }

  const { error } = await supabase
    .from("user_profiles")
    .upsert(payload, { onConflict: "user_id" })

  if (error) throw error
}

async function saveBridge(supabase: SupabaseClient, providerUserId: string, supabaseUserId: string) {
  const { error } = await supabase
    .from("auth_user_bridges")
    .insert({
      provider: AUTHING_PROVIDER,
      provider_user_id: providerUserId,
      supabase_user_id: supabaseUserId,
    })

  if (!error) return supabaseUserId

  const concurrentUserId = await findBridgedUserId(supabase, providerUserId)
  if (concurrentUserId) return concurrentUserId
  throw error
}

export async function resolveLearningUserId(user: VerifiedUser): Promise<string> {
  if (isSupabaseUuid(user.id)) return user.id

  const supabase = getSupabaseAdmin()
  const existingUserId = await findBridgedUserId(supabase, user.id)
  if (existingUserId) {
    await saveAuthingProfile(supabase, existingUserId, user)
    return existingUserId
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

  if (error) {
    const concurrentUserId = await findBridgedUserId(supabase, user.id)
    if (concurrentUserId) return concurrentUserId
    throw error
  }
  if (!data.user?.id) throw new Error("创建学习用户失败")

  const bridgedUserId = await saveBridge(supabase, user.id, data.user.id)
  await saveAuthingProfile(supabase, bridgedUserId, user)
  return bridgedUserId
}

export async function requireLearningUserId(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth.response) return { userId: null, auth, response: auth.response }

  const userId = await resolveLearningUserId(auth.user!)
  return { userId, auth, response: null }
}
