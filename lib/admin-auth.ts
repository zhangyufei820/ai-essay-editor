/**
 * 管理后台认证工具 - Supabase 持久化版（内存 fallback）
 * Token 存储在 admin_tokens 表，表不存在时 fallback 到内存
 */
import { createClient } from '@supabase/supabase-js'
import { assertSecureTlsConfiguration } from '@/lib/runtime-security'

// 内存 fallback（表不存在时使用）
const memoryTokenStore = new Map<string, { expires: number }>()
let useMemoryFallback = false

function getConfiguredAdminPassword(): string | null {
  const adminPassword = process.env.ADMIN_PASSWORD?.trim()
  return adminPassword ? adminPassword : null
}

export function isAdminPasswordConfigured(): boolean {
  return getConfiguredAdminPassword() !== null
}

const getSupabaseAdmin = () => {
  assertSecureTlsConfiguration()

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * 生成管理员 token
 * @param password 密码
 * @returns token 字符串或 null（如果密码错误）
 */
export async function generateAdminToken(password: string): Promise<string | null> {
  const adminPassword = getConfiguredAdminPassword()

  if (!adminPassword) {
    console.error('[AdminAuth] ADMIN_PASSWORD is not configured')
    await logAdminAction('login_rejected', null, { reason: 'admin_password_not_configured' })
    return null
  }
  
  if (password !== adminPassword) {
    await logAdminAction('login_failed', null, { reason: '密码错误' })
    return null
  }
  
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2)
  const tokenData = `${timestamp}:${random}`
  const token = `admin_${btoa(tokenData)}`
  const expiresAt = new Date(timestamp + 24 * 60 * 60 * 1000).toISOString()
  
  if (useMemoryFallback) {
    memoryTokenStore.set(token, { expires: timestamp + 24 * 60 * 60 * 1000 })
    return token
  }
  
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('admin_tokens')
      .insert({ token, expires_at: expiresAt })
    
    if (error) {
      // 表不存在，切换到内存模式
      console.warn('[AdminAuth] admin_tokens 表不存在，使用内存模式:', error.message)
      useMemoryFallback = true
      memoryTokenStore.set(token, { expires: timestamp + 24 * 60 * 60 * 1000 })
    }
  } catch (e) {
    useMemoryFallback = true
    memoryTokenStore.set(token, { expires: timestamp + 24 * 60 * 60 * 1000 })
  }
  
  await logAdminAction('login_success', token, { token: token.substring(0, 20) + '...' })
  return token
}

/**
 * 验证管理员 token
 */
export async function verifyAdminToken(token: string): Promise<boolean> {
  if (!token || !token.startsWith('admin_')) return false
  
  if (useMemoryFallback) {
    const entry = memoryTokenStore.get(token)
    return entry ? entry.expires > Date.now() : false
  }
  
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('admin_tokens')
      .select('expires_at')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    
    if (error) {
      // 表不存在，fallback
      if (error.code === '42P01') {
        useMemoryFallback = true
        return false
      }
      return false
    }
    
    return !!data
  } catch {
    return false
  }
}

/**
 * 注销 token
 */
export async function revokeAdminToken(token: string): Promise<void> {
  if (useMemoryFallback) {
    memoryTokenStore.delete(token)
    return
  }
  try {
    await getSupabaseAdmin().from('admin_tokens').delete().eq('token', token)
  } catch { /* ignore */ }
}

/**
 * 清理过期 token
 */
export async function cleanupExpiredTokens(): Promise<void> {
  if (useMemoryFallback) {
    const now = Date.now()
    for (const [token, data] of memoryTokenStore.entries()) {
      if (data.expires < now) memoryTokenStore.delete(token)
    }
    return
  }
  try {
    await getSupabaseAdmin()
      .from('admin_tokens')
      .delete()
      .lt('expires_at', new Date().toISOString())
  } catch { /* ignore */ }
}

// ============================================
// 🔍 审计日志
// ============================================

/**
 * 记录管理员操作审计日志
 */
export async function logAdminAction(
  action: string,
  adminToken: string | null,
  details?: Record<string, any>
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    await supabase
      .from('admin_actions')
      .insert({
        action,
        admin_token_prefix: adminToken ? adminToken.substring(0, 20) + '...' : null,
        details: details || {},
        created_at: new Date().toISOString(),
      })
  } catch (error) {
    // 审计日志失败不应影响主流程
    console.error('[AdminAudit] 记录审计日志失败:', error)
  }
}
