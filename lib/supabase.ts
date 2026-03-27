// 延迟初始化 Supabase 客户端
// 避免在 Docker 构建阶段因环境变量缺失导致报错
import type { SupabaseClient } from "@supabase/supabase-js"
import { createBrowserClient } from "@supabase/ssr"

let supabaseInstance: SupabaseClient | null = null

export const supabase = {
  get client() {
    if (supabaseInstance) {
      return supabaseInstance
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn("[v0] Supabase credentials not configured. Auth features will be disabled.")
      return null as any
    }

    supabaseInstance = createBrowserClient(supabaseUrl, supabaseAnonKey)
    return supabaseInstance
  }
}
