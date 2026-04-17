import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminToken } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // 验证管理员 token
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token || !verifyAdminToken(token)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 获取用户ID参数
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 })
    }

    // 使用 Service Role Key 绕过 RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 获取用户信息
    const { data: user, error: userError } = await supabaseAdmin
      .from('user_credits')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (userError) {
      console.error('获取用户信息失败:', userError)
      return NextResponse.json({ error: '用户不存在' }, { status: 404 })
    }

    // 获取用户的交易记录
    const { data: transactions, error: transactionsError } = await supabaseAdmin
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (transactionsError) {
      console.error('获取用户交易记录失败:', transactionsError)
    }

    // 获取用户的订单记录
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (ordersError) {
      console.error('获取用户订单记录失败:', ordersError)
    }

    // 计算用户统计信息
    const totalTransactions = transactions?.length || 0
    const totalOrders = orders?.length || 0
    const totalSpent = orders
      ?.filter(o => o.status === 'paid')
      .reduce((sum, order) => sum + (order.amount || 0), 0) || 0

    return NextResponse.json({
      success: true,
      data: {
        user: {
          user_id: user.user_id,
          credits: user.credits || 0,
          is_pro: user.is_pro || false,
          membership_status: user.membership_status || 'free',
          created_at: user.created_at,
          updated_at: user.updated_at
        },
        transactions: transactions || [],
        orders: orders || [],
        stats: {
          totalTransactions,
          totalOrders,
          totalSpent
        }
      }
    })

  } catch (error: any) {
    console.error('获取用户详情失败:', error)
    return NextResponse.json(
      { error: '获取用户详情失败', details: error.message },
      { status: 500 }
    )
  }
}