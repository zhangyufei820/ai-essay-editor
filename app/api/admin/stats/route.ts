import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminToken } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // 验证管理员 token
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token || !(await verifyAdminToken(token))) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 记录审计日志
    const { logAdminAction } = await import('@/lib/admin-auth')
    await logAdminAction('view_stats', token)

    // 使用 Service Role Key 绕过 RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 获取今天的日期范围
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayISO = today.toISOString()

    // 1. 获取总用户数 - 从 user_credits 表
    const { count: totalUsers, error: totalUsersError } = await supabaseAdmin
      .from('user_credits')
      .select('*', { count: 'exact', head: true })

    if (totalUsersError) {
      console.error('获取总用户数失败:', totalUsersError)
    }

    // 2. 获取会员用户数 (is_pro = true)
    const { count: memberUsers, error: memberUsersError } = await supabaseAdmin
      .from('user_credits')
      .select('*', { count: 'exact', head: true })
      .eq('is_pro', true)

    if (memberUsersError) {
      console.error('获取会员用户数失败:', memberUsersError)
    }

    // 3. 获取今日新增用户数 (今天更新的 user_credits 记录，用 updated_at 近似)
    const { count: todayNewUsers, error: todayNewUsersError } = await supabaseAdmin
      .from('user_credits')
      .select('*', { count: 'exact', head: true })
      .gte('updated_at', todayISO)

    if (todayNewUsersError) {
      console.error('获取今日新增用户失败:', todayNewUsersError)
    }

    // 4. 获取今日活跃用户数 (今天有 credit_transactions 记录的去重 user_id)
    const { data: todayActiveData, error: todayActiveError } = await supabaseAdmin
      .from('credit_transactions')
      .select('user_id')
      .gte('created_at', todayISO)

    if (todayActiveError) {
      console.error('获取今日活跃用户失败:', todayActiveError)
    }

    // 去重计数
    const todayActiveUsers = todayActiveData 
      ? new Set(todayActiveData.map(t => t.user_id)).size 
      : 0

    // 5. 获取总营收 (已支付订单的金额总和)
    const { data: revenueData, error: revenueError } = await supabaseAdmin
      .from('orders')
      .select('amount')
      .eq('status', 'paid')

    if (revenueError) {
      console.error('获取总营收失败:', revenueError)
    }

    const totalRevenue = revenueData 
      ? revenueData.reduce((sum, order) => sum + (order.amount || 0), 0)
      : 0

    // 6. 获取今日营收 (今天已支付订单的金额总和)
    const { data: todayRevenueData, error: todayRevenueError } = await supabaseAdmin
      .from('orders')
      .select('amount')
      .eq('status', 'paid')
      .gte('created_at', todayISO)

    if (todayRevenueError) {
      console.error('获取今日营收失败:', todayRevenueError)
    }

    const todayRevenue = todayRevenueData 
      ? todayRevenueData.reduce((sum, order) => sum + (order.amount || 0), 0)
      : 0

    return NextResponse.json({
      success: true,
      data: {
        totalUsers: totalUsers || 0,
        memberUsers: memberUsers || 0,
        todayNewUsers: todayNewUsers || 0,
        todayActiveUsers,
        totalRevenue,
        todayRevenue
      }
    })

  } catch (error: any) {
    console.error('获取统计数据失败:', error)
    return NextResponse.json(
      { error: '获取统计数据失败', details: error.message },
      { status: 500 }
    )
  }
}