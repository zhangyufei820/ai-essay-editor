import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

// 🚀 单例模式 - 全局只创建一个 Supabase 客户端实例
// 避免 GoTrueClient 重复初始化导致的性能问题
let supabaseInstance: SupabaseClient | null = null

export function createClient() {
  // 如果已经有实例，直接返回（单例）
  if (supabaseInstance) {
    return supabaseInstance
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("[v0] Supabase credentials not configured. Auth features will be disabled.")
    return null
  }

  // 创建并缓存实例
  supabaseInstance = createBrowserClient(supabaseUrl, supabaseAnonKey)
  
  return supabaseInstance
}

// 🔥 导出获取单例的便捷方法
export function getSupabaseClient() {
  return createClient()
}
