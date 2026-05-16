import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/verified-user'

// 🔥 移除 edge runtime，使用 Node.js runtime 以支持 admin API
export const dynamic = 'force-dynamic'

// 使用 Service Role Key (超级管理员权限)
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url || !key) {
    throw new Error('缺少 Supabase 配置')
  }
  
  return createClient(url, key)
}

function isUUID(str: string) {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(str);
}

// 暴力提取纯数字 (把 +86, -, 空格全部干掉)
export async function POST(req: NextRequest) {
  console.log('[Admin Update] 收到更新请求')
  
  try {
    const auth = await requireUser(req)
    if (auth.response) return auth.response
    // IP 限流：30次/分钟
    const { getClientIP, checkIpRateLimit, createRateLimitResponse } = await import('@/lib/rate-limit')
    const ip = getClientIP(req)
    const limitResult = checkIpRateLimit(ip, 30)
    if (!limitResult.allowed) {
      return createRateLimitResponse(limitResult.retryAfter!)
    }
    const supabaseAdmin = getSupabaseAdmin()
    let { userId: requestedUserId, name, avatarUrl } = await req.json()
    let userId = auth.user!.id

    console.log('[Admin Update] 请求参数:', { userId: userId?.slice(0, 10), name, hasAvatar: !!avatarUrl })

    if (requestedUserId && requestedUserId !== userId) {
      return NextResponse.json({ error: "无权更新其他用户资料" }, { status: 403 })
    }

    console.log(`[Admin Update] 正在寻找用户: ${userId}`)

    // 1. 先更新数据库中的 profile，避免依赖 auth.users 的 UUID 假设
    const { error: profileUpdateError } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        user_id: userId,
        nickname: name,
        avatar_url: avatarUrl || null,
      }, { onConflict: 'user_id' })

    if (profileUpdateError) {
      console.error("Supabase profile 更新失败:", profileUpdateError)
      return NextResponse.json({ error: profileUpdateError.message }, { status: 500 })
    }

    console.log('[Admin Update] 执行更新:', { userId, name, hasAvatar: !!avatarUrl })

    let data: any = { user: { id: userId } }

    // 2. 如果是 Supabase UUID，再同步 auth.users 元数据
    if (isUUID(userId)) {
      const authUpdate = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        {
          user_metadata: {
            name: name,
            avatar_url: avatarUrl
          }
        }
      )

      if (authUpdate.error) {
        console.error("Supabase 更新失败:", authUpdate.error)
        return NextResponse.json({ error: authUpdate.error.message }, { status: 500 })
      }
      data = authUpdate.data
    }

    console.log(`[Admin Update] ✅ 更新成功!`)
    return NextResponse.json({ success: true, user: data.user })

  } catch (error: any) {
    console.error("API 内部错误:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
