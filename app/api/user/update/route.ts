import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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
function getPureNumbers(str: any) {
  if (!str) return ""
  return String(str).replace(/\D/g, '') 
}

export async function POST(req: NextRequest) {
  console.log('[Admin Update] 收到更新请求')
  
  try {
    // IP 限流：30次/分钟
    const { getClientIP, checkIpRateLimit, createRateLimitResponse } = await import('@/lib/rate-limit')
    const ip = getClientIP(req)
    const limitResult = checkIpRateLimit(ip, 30)
    if (!limitResult.allowed) {
      return createRateLimitResponse(limitResult.retryAfter!)
    }
    const supabaseAdmin = getSupabaseAdmin()
    let { userId, name, avatarUrl } = await req.json()

    console.log('[Admin Update] 请求参数:', { userId: userId?.slice(0, 10), name, hasAvatar: !!avatarUrl })

    if (!userId) {
      return NextResponse.json({ error: "缺少 User ID" }, { status: 400 })
    }

    console.log(`[Admin Update] 正在寻找用户: ${userId}`)

    // 1. 如果传进来的是 UUID，直接更新
    if (isUUID(userId)) {
        console.log('[Admin Update] 检测到 UUID 格式，直接更新')
    } 
    // 2. 如果不是 UUID，开启【全网通缉】模式
    else {
      const searchTarget = getPureNumbers(userId) // 目标号码纯数字：15881822773
      
      console.log(`[Admin Update] 启动模糊搜索，目标特征码: ${searchTarget}`)
      
      // 获取前 1000 个用户
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        perPage: 1000 
      })
      
      if (listError) {
        console.error('[Admin Update] 获取用户列表失败:', listError)
        throw listError
      }

      // 🕵️‍♂️ 深度比对
      const targetUser = users.find((u: any) => {
        // A. 检查标准手机号字段
        const dbPhone = getPureNumbers(u.phone)
        // B. 检查邮箱字段 (有些人用手机号当邮箱注册)
        const dbEmail = getPureNumbers(u.email)
        // C. 检查元数据里的字段
        const metaPhone = getPureNumbers(u.user_metadata?.phone || u.user_metadata?.mobile || "")

        // 比对逻辑：只要任何一个字段包含了目标号码（或者被包含），就认为是这个人
        if (dbPhone.includes(searchTarget) || searchTarget.includes(dbPhone)) return true
        if (dbEmail.includes(searchTarget) || searchTarget.includes(dbEmail)) return true
        if (metaPhone.includes(searchTarget)) return true
        
        return false
      })

      if (targetUser) {
        console.log(`[Admin Update] ✅ 找到目标! 真实ID: ${targetUser.id}, 手机: ${targetUser.phone}`)
        userId = targetUser.id // 替换为真实的 UUID
      } else {
        // 🛑 调试信息：如果找不到，打印前3个用户看看长什么样，方便排查
        console.error(`[Admin Update] ❌ 遍历了 ${users.length} 个用户仍未找到。`)
        if (users.length > 0) {
            console.log("数据库里的用户样本:", users.slice(0, 3).map((u: any) => ({ id: u.id, phone: u.phone, email: u.email })))
        }
        
        return NextResponse.json({ 
            error: `后端未找到账号 ${userId}。可能是数据库中存储的格式差异，请查看后端日志。` 
        }, { status: 404 })
      }
    }

    // 3. 执行强制更新
    console.log('[Admin Update] 执行更新:', { userId, name, hasAvatar: !!avatarUrl })
    
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        user_metadata: {
          name: name,
          avatar_url: avatarUrl
        }
      }
    )

    if (error) {
      console.error("Supabase 更新失败:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[Admin Update] ✅ 更新成功!`)
    return NextResponse.json({ success: true, user: data.user })

  } catch (error: any) {
    console.error("API 内部错误:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
