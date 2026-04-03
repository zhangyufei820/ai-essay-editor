import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 使用 Service Role Key 绕过 RLS - 延迟创建避免构建时错误
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// 🔥 将数据库中的 type 映射为显示标签
function mapTypeToLabel(type: string): string {
  const typeMap: Record<string, string> = {
    'purchase': '购买积分',
    'consume': '消耗积分',
    'refund': '退款积分',
    'bonus': '奖励积分',
    'register': '注册积分',
    'manual': '手动调整',
    // 🎵 Suno 音乐创作相关
    'suno_music': '音乐创作',
    'suno_llm_token': '音乐创作',
    // 🎨 其他模型
    'referral': '邀请奖励',
  }
  return typeMap[type] || '消耗积分'
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')

    if (!userId) {
      return NextResponse.json({ error: '缺少 user_id 参数' }, { status: 400 })
    }

    console.log('📊 [积分记录] 查询用户:', userId)

    // 🔥 先检查 credit_transactions 表是否存在
    let tableExists = true
    const supabaseAdmin = getSupabaseAdmin()
    try {
      const { error: checkError } = await supabaseAdmin
        .from('credit_transactions')
        .select('id')
        .limit(1)
      
      if (checkError && checkError.code === '42P01') {
        tableExists = false
        console.log('⚠️ [积分记录] credit_transactions 表不存在')
      }
    } catch (e) {
      tableExists = false
    }

    // 尝试从 credit_transactions 表获取
    let transactions: any[] = []
    if (tableExists) {
      const { data: txData, error: txError } = await supabaseAdmin
        .from('credit_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (!txError && txData && txData.length > 0) {
        console.log('✅ [积分记录] 从 credit_transactions 获取到', txData.length, '条记录')
        return NextResponse.json({
          transactions: txData.map((t: any) => ({
            id: t.id,
            description: t.description || t.reason || '-',
            amount: t.amount,
            type: t.amount > 0 ? '获得' : '消耗',
            credit_type: mapTypeToLabel(t.type) || '其他积分',
            created_at: t.created_at,
          }))
        })
      }
      
      if (txError) {
        console.log('⚠️ [积分记录] 查询 credit_transactions 失败:', txError.message)
      }
    }

    // 如果 credit_transactions 表没有数据，尝试从 orders 表构建记录
    console.log('📊 [积分记录] credit_transactions 无数据，尝试从 orders 构建')

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(20)

    const orderTransactions = (orders || []).map((order: any) => ({
      id: `order-${order.id}`,
      description: order.product_name || '购买积分',
      amount: order.credits || 0,
      type: '获得',
      credit_type: '购买积分',
      created_at: order.paid_at || order.created_at,
    }))

    // 获取用户创建时间，添加注册赠送记录
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('created_at')
      .eq('id', userId)
      .single()

    const allTransactions = [...orderTransactions]

    // 添加注册赠送记录（如果有 profile）
    if (profile) {
      allTransactions.push({
        id: 'register-bonus',
        description: '新用户注册赠送',
        amount: 1000,
        type: '获得',
        credit_type: '注册积分',
        created_at: profile.created_at,
      })
    }

    // 🔥 如果仍然没有数据，从 user_credits 表获取当前积分并生成一条记录
    if (allTransactions.length === 0) {
      const { data: userCredits } = await supabaseAdmin
        .from('user_credits')
        .select('credits, created_at, updated_at')
        .eq('user_id', userId)
        .single()
      
      if (userCredits) {
        // 添加当前积分记录
        allTransactions.push({
          id: 'current-balance',
          description: '账户当前积分',
          amount: userCredits.credits || 0,
          type: '获得',
          credit_type: '其他积分',
          created_at: userCredits.updated_at || userCredits.created_at || new Date().toISOString(),
        })
      }
    }

    // 按时间排序
    allTransactions.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    console.log('✅ [积分记录] 构建了', allTransactions.length, '条记录')

    return NextResponse.json({
      transactions: allTransactions
    })

  } catch (error: any) {
    console.error('❌ [积分记录] 查询失败:', error)
    return NextResponse.json({ 
      error: error.message || '查询失败',
      transactions: []
    }, { status: 500 })
  }
}
