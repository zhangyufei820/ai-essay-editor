import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 使用 Service Role Key 绕过 RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')

    if (!userId) {
      return NextResponse.json({ error: '缺少 user_id 参数' }, { status: 400 })
    }

    console.log('📊 [积分记录] 查询用户:', userId)

    // 尝试从 credit_transactions 表获取
    const { data: transactions, error: txError } = await supabaseAdmin
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!txError && transactions && transactions.length > 0) {
      console.log('✅ [积分记录] 从 credit_transactions 获取到', transactions.length, '条记录')
      return NextResponse.json({
        transactions: transactions.map((t: any) => ({
          id: t.id,
          description: t.description || t.reason || '-',
          amount: t.amount,
          type: t.amount > 0 ? '获得' : '消耗',
          credit_type: t.credit_type || t.type || '其他积分',
          created_at: t.created_at,
        }))
      })
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
        description: '新用户注册',
        amount: 3000,
        type: '获得',
        credit_type: '注册积分',
        created_at: profile.created_at,
      })
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
