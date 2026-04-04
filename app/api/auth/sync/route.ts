import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    // 1. 获取前端传来的用户信息
    const body = await request.json()
    const { user_id, email, nickname, avatar, phone } = body

    if (!user_id) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
    }

    // 🔐 安全验证：检查请求来源
    // 方式1: 检查 Referer 头，确保请求来自本站
    const referer = request.headers.get('referer') || ''
    const origin = request.headers.get('origin') || ''
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    
    // 🔥 修复：支持 Vercel 部署域名验证
    // Vercel 部署的域名格式：*.vercel.app 或自定义域名
    const isValidOrigin = referer.startsWith(appUrl) ||
                          origin.startsWith(appUrl) ||
                          referer.includes('localhost') ||
                          origin.includes('localhost') ||
                          referer.includes('vercel.app') ||
                          origin.includes('vercel.app') ||
                          referer.includes('shenxiangzhixue') ||
                          origin.includes('shenxiangzhixue') ||
                          referer.includes('shenxiang.school') ||
                          origin.includes('shenxiang.school')
    
    if (!isValidOrigin) {
      console.warn(`🚫 [Auth/Sync] 可疑请求来源被拦截: referer=${referer}, origin=${origin}`)
      return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
    }

    // 方式2: 基本的 user_id 格式验证（防止注入攻击）
    // Authing 的 user_id 通常是 24 位十六进制字符串
    const isValidUserId = /^[a-f0-9]{24}$/.test(user_id) || 
                          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user_id)
    
    if (!isValidUserId) {
      console.warn(`🚫 [Auth/Sync] 无效的 user_id 格式: ${user_id}`)
      return NextResponse.json({ error: 'Invalid user_id format' }, { status: 400 })
    }

    // 2. 使用 Service Role Key 创建超级管理员客户端
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 3. 检查用户是否已存在
    const { data: existingUser } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id')
      .eq('user_id', user_id)
      .single()

    // 4. 如果是新用户，执行初始化
    if (!existingUser) {
      // 日志优化：如果是手机注册，email可能为空，所以打印 phone 或 user_id
      console.log(`[Sync] 新用户 ${email || phone || user_id} 初始化中...`)

      // A. 插入个人资料
      const { error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .insert({
          user_id,
          email: email || null, // 确保如果是手机注册，email 存为 null 而不是 undefined
          phone: phone || null, // 【修改点 2】: 将手机号写入数据库
          
          // 【修改点 3】: 智能昵称逻辑
          // 优先级：前端传来的昵称 > 邮箱前缀 > 手机号 > '新用户'
          nickname: nickname || email?.split('@')[0] || phone || '新用户',
          
          avatar_url: avatar
        })
      
      if (profileError) {
        console.error('创建 Profile 失败:', profileError)
        // 如果这里报错，通常是因为数据库没有 phone 列，或者字段类型不对
      }

      // B. ✨ 赠送初始积分 (1000 分) ✨
      // 🔥 只使用数据库中存在的字段：user_id, credits, is_pro
      const { error: creditError } = await supabaseAdmin
        .from('user_credits')
        .insert({
          user_id,
          credits: 1000, 
          is_pro: false
        })

      if (creditError) {
        console.error('赠送积分失败:', creditError)
        // 如果插入失败，尝试 upsert
        const { error: upsertError } = await supabaseAdmin
          .from('user_credits')
          .upsert({
            user_id,
            credits: 1000, 
            is_pro: false
          })
        if (upsertError) {
          console.error('Upsert 积分也失败:', upsertError)
        } else {
          console.log(`✅ [Sync] 用户 ${user_id} 积分 Upsert 成功`)
        }
      } else {
        console.log(`✅ [Sync] 用户 ${user_id} 赠送 1000 积分成功`)
      }

      return NextResponse.json({ success: true, message: 'New user initialized' })
    }

    // 老用户登录，什么都不做
    return NextResponse.json({ success: true, message: 'User already exists' })

  } catch (error) {
    console.error('[Sync API Error]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
