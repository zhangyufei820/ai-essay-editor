import type { SupabaseClient } from "@supabase/supabase-js"

export type CreditAccount = {
  credit_user_id: string
  credits: number
  is_pro: boolean
  initialized: boolean
}

export async function ensureCreditAccount(supabase: SupabaseClient, userId: string): Promise<CreditAccount> {
  const { data, error } = await supabase.rpc("ensure_credit_account", { p_user_id: userId })
  if (error) throw error
  const account = Array.isArray(data) ? data[0] : data
  if (!account || typeof account.credit_user_id !== "string" || !Number.isInteger(account.credits)) {
    throw new Error("积分账户初始化返回无效数据")
  }
  return account as CreditAccount
}
