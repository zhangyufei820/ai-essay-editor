import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let supabaseAdminInstance: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error("缺少 Supabase 配置")
  }

  if (!supabaseAdminInstance) {
    supabaseAdminInstance = createClient(url, key)
  }

  return supabaseAdminInstance
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseAdmin()
    const value = Reflect.get(client, prop, client)
    return typeof value === "function" ? value.bind(client) : value
  },
})
