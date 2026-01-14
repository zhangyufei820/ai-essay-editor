import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * 🎯 用户积分 API
 * 
 * GET /api/user/credits?user_id=xxx - 查询积分
 * POST /api/user/credits - 扣除/增加积分
 * 
 * 使用 Service Role Key，绕过 RLS 限制
 */

// 创建超级管理员客户端
const getSupabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

/**
 * 🎯 POST - 扣除/增加积分
 * 
 * Body: { userId: string, amount: number, reason?: string }
 * amount 为负数表示扣除，正数表示增加
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { userId, amount, reason } = body

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    if (typeof amount !== 'number') {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    console.log(`💰 [积分API] 变更积分: userId=${userId}, amount=${amount}, reason=${reason}`)

    const supabaseAdmin = getSupabaseAdmin()

    // 先查询当前积分（使用 maybeSingle 避免用户不存在时报错）
    const { data: currentData, error: queryError } = await supabaseAdmin
      .from('user_credits')
      .select('credits')
      .eq('user_id', userId)
      .maybeSingle()

    // 🔥 如果用户没有积分记录，先创建一条
    if (!currentData) {
      console.log(`🆕 [积分API] 用户 ${userId} 无积分记录，自动创建...`)
      const { data: newCredit, error: createError } = await supabaseAdmin
        .from('user_credits')
        .upsert({
          user_id: userId,
          credits: 1000,
          is_pro: false
        })
        .select('credits')
        .single()
      
      if (createError) {
        console.error(`❌ [积分API] 创建积分记录失败:`, createError)
        return NextResponse.json({ error: createError.message }, { status: 500 })
      }
      // 使用新创建的积分继续处理
      var currentCredits = newCredit?.credits || 1000
    } else {
      var currentCredits = currentData.credits || 0
    }

    if (queryError && queryError.code !== 'PGRST116') {
      console.error(`❌ [积分API] 查询当前积分失败:`, queryError)
      return NextResponse.json({ error: queryError.message }, { status: 500 })
    }
    const newCredits = Math.max(0, currentCredits + amount) // 确保不会变成负数

    // 更新积分
    const { data: updateData, error: updateError } = await supabaseAdmin
      .from('user_credits')
      .update({ credits: newCredits })
      .eq('user_id', userId)
      .select('credits')
      .single()

    if (updateError) {
      console.error(`❌ [积分API] 更新积分失败:`, updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    console.log(`✅ [积分API] 积分变更成功: ${currentCredits} → ${newCredits} (${amount > 0 ? '+' : ''}${amount})`)

    // 🔥 记录到 credit_transactions 表
    try {
      const transactionType = amount > 0 ? 'bonus' : 'consume'
      const { error: txError } = await supabaseAdmin
        .from('credit_transactions')
        .insert({
          user_id: userId,
          amount: amount,
          type: transactionType,
          description: reason || (amount > 0 ? '积分增加' : '积分消耗'),
          reason: reason || (amount > 0 ? '积分增加' : '积分消耗')
        })
      
      if (txError) {
        console.error(`⚠️ [积分API] 记录交易失败:`, txError)
        // 不影响主流程，继续返回成功
      } else {
        console.log(`✅ [积分API] 交易记录已保存`)
      }
    } catch (txErr) {
      console.error(`⚠️ [积分API] 记录交易异常:`, txErr)
    }

    return NextResponse.json({
      success: true,
      previousCredits: currentCredits,
      newCredits: updateData?.credits || newCredits,
      change: amount
    })

  } catch (error) {
    console.error('[积分API] POST 异常:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
