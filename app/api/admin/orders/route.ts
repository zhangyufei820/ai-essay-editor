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
    await logAdminAction('view_orders', token)

    // 获取查询参数
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '50')
    const status = searchParams.get('status') || ''

    // 使用 Service Role Key 绕过 RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 构建查询
    let query = supabaseAdmin
      .from('orders')
      .select(`
        id,
        order_no,
        user_id,
        product_name,
        product_id,
        amount,
        credits_amount,
        payment_method,
        status,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (status) {
      query = query.eq('status', status)
    }

    const { data: orders, error: ordersError } = await query

    if (ordersError) {
      console.error('获取订单列表失败:', ordersError)
      return NextResponse.json({ error: '获取订单列表失败，请稍后重试' }, { status: 500 })
    }

    // 获取订单总数（用于分页）
    let countQuery = supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact', head: true })

    if (status) {
      countQuery = countQuery.eq('status', status)
    }

    const { count: totalOrders, error: countError } = await countQuery

    if (countError) {
      console.error('获取订单总数失败:', countError)
    }

    // 获取总收入（所有已支付订单）
    const { data: revenueData, error: revenueError } = await supabaseAdmin
      .from('orders')
      .select('amount')
      .eq('status', 'paid')

    if (revenueError) {
      console.error('获取总收入失败:', revenueError)
    }

    const totalRevenue = revenueData 
      ? revenueData.reduce((sum, order) => sum + (order.amount || 0), 0)
      : 0

    return NextResponse.json({
      success: true,
      data: orders?.map(order => ({
        id: order.id,
        order_no: order.order_no,
        user_id: order.user_id,
        product_name: order.product_name || '未知产品',
        product_id: order.product_id,
        amount: order.amount || 0,
        credits_amount: order.credits_amount || 0,
        payment_method: order.payment_method,
        status: order.status,
        created_at: order.created_at,
        updated_at: order.updated_at
      })) || [],
      pagination: {
        page,
        pageSize,
        total: totalOrders || 0,
        totalPages: Math.ceil((totalOrders || 0) / pageSize)
      },
      totalRevenue
    })

  } catch (error) {
    console.error('获取订单列表失败:', error)
    return NextResponse.json(
      { error: '获取订单列表失败，请稍后重试' },
      { status: 500 }
    )
  }
}
