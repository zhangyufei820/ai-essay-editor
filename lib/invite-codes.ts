import { createClient } from "@/lib/supabase/client"

export async function validateInviteCode(code: string): Promise<{ valid: boolean; error?: string }> {
  const supabase = createClient()

  const { data: inviteCode, error } = await supabase
    .from("invite_codes")
    .select("*")
    .eq("code", code.toUpperCase())
    .eq("is_active", true)
    .single()

  if (error || !inviteCode) {
    return { valid: false, error: "邀请码无效" }
  }

  if (inviteCode.expires_at && new Date(inviteCode.expires_at) < new Date()) {
    return { valid: false, error: "邀请码已过期" }
  }

  if (inviteCode.used_count >= inviteCode.max_uses) {
    return { valid: false, error: "邀请码已达到使用上限" }
  }

  return { valid: true }
}

export async function recordInviteCodeUsage(code: string, userId: string): Promise<void> {
  const supabase = createClient()

  const { data: inviteCode } = await supabase
    .from("invite_codes")
    .select("id, used_count")
    .eq("code", code.toUpperCase())
    .single()

  if (!inviteCode) return

  await supabase.from("invite_code_usage").insert({
    invite_code_id: inviteCode.id,
    user_id: userId,
  })

  await supabase
    .from("invite_codes")
    .update({ used_count: inviteCode.used_count + 1 })
    .eq("id", inviteCode.id)
}
