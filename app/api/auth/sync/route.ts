import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    // 1. 获取前端传来的用户信息
    const body = await request.json()
    const { user_id, email, nickname, avatar } = body

    if (!user_id) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
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
      console.log(`[Sync] 新用户 ${email} 初始化中...`)

      // A. 插入个人资料
      const { error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .insert({
          user_id,
          email,
          nickname: nickname || email?.split('@')[0] || '新用户',
          avatar_url: avatar
        })
      
      if (profileError) console.error('创建 Profile 失败:', profileError)

      // B. ✨ 赠送初始积分 (这里改成 1000 分) ✨
      const { error: creditError } = await supabaseAdmin
        .from('user_credits')
        .insert({
          user_id,
          credits: 1000, 
          is_pro: false
        })

      if (creditError) console.error('赠送积分失败:', creditError)

      return NextResponse.json({ success: true, message: 'New user initialized' })
    }

    // 老用户登录，什么都不做
    return NextResponse.json({ success: true, message: 'User already exists' })

  } catch (error) {
    console.error('[Sync API Error]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}