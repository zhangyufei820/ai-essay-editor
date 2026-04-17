/**
 * 管理后台认证工具 - Supabase 持久化版
 * Token 存储在 admin_tokens 表，支持多实例 / 重启不丢失
 */
import { createClient } from '@supabase/supabase-js'

const getSupabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * 生成管理员 token
 * @param password 密码
 * @returns token 字符串或 null（如果密码错误）
 */
export async function generateAdminToken(password: string): Promise<string | null> {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin2026'
  
  if (password !== adminPassword) {
    // 记录失败登录尝试
    await logAdminAction('login_failed', null, { reason: '密码错误' })
    return null
  }
  
  // 生成 token
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2)
  const tokenData = `${timestamp}:${random}`
  const token = `admin_${btoa(tokenData)}`
  
  // 存储到 Supabase，有效期 24 小时
  const supabase = getSupabaseAdmin()
  const expiresAt = new Date(timestamp + 24 * 60 * 60 * 1000).toISOString()
  
  const { error } = await supabase
    .from('admin_tokens')
    .insert({
      token,
      expires_at: expiresAt,
    })
  
  if (error) {
    console.error('[AdminAuth] 保存 token 失败:', error)
    return null
  }
  
  // 记录成功登录
  await logAdminAction('login_success', null, { token: token.substring(0, 20) + '...' })
  
  return token
}

/**
 * 验证管理员 token
 */
export async function verifyAdminToken(token: string): Promise<boolean> {
  if (!token || !token.startsWith('admin_')) {
    return false
  }
  
  const supabase = getSupabaseAdmin()
  
  const { data, error } = await supabase
    .from('admin_tokens')
    .select('expires_at')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  
  if (error) {
    console.error('[AdminAuth] 验证 token 失败:', error)
    return false
  }
  
  return !!data
}

/**
 * 注销 token
 */
export async function revokeAdminToken(token: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  await supabase
    .from('admin_tokens')
    .delete()
    .eq('token', token)
}

/**
 * 清理过期 token（定期调用）
 */
export async function cleanupExpiredTokens(): Promise<void> {
  const supabase = getSupabaseAdmin()
  await supabase
    .from('admin_tokens')
    .delete()
    .lt('expires_at', new Date().toISOString())
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
