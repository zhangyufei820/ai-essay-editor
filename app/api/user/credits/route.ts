import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * 🎯 用户积分查询 API
 * 
 * GET /api/user/credits?user_id=xxx
 * 
 * 使用 Service Role Key 查询，绕过 RLS 限制
 */

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')

    if (!userId) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
    }

    console.log(`🔍 [积分API] 查询用户积分: ${userId}`)

    // 使用 Service Role Key 创建超级管理员客户端
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 查询积分
    const { data: creditData, error } = await supabaseAdmin
      .from('user_credits')
      .select('credits, is_pro')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error(`❌ [积分API] 查询失败:`, error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 如果没有记录，自动创建
    if (!creditData) {
      console.log(`🆕 [积分API] 用户 ${userId} 无积分记录，自动创建...`)
      
      const { data: newData, error: insertError } = await supabaseAdmin
        .from('user_credits')
        .upsert({
          user_id: userId,
          credits: 1000,
          is_pro: false
        })
        .select('credits, is_pro')
        .single()

      if (insertError) {
        console.error(`❌ [积分API] 创建积分记录失败:`, insertError)
        // 即使创建失败，也返回默认值
        return NextResponse.json({ 
          credits: 1000, 
          is_pro: false,
          isNew: true 
        })
      }

      console.log(`✅ [积分API] 新用户积分初始化成功:`, newData)
      return NextResponse.json({ 
        credits: newData?.credits || 1000, 
        is_pro: newData?.is_pro || false,
        isNew: true 
      })
    }

    console.log(`✅ [积分API] 查询成功: credits=${creditData.credits}`)
    return NextResponse.json({ 
      credits: creditData.credits, 
      is_pro: creditData.is_pro 
    })

  } catch (error) {
    console.error('[积分API] 异常:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
