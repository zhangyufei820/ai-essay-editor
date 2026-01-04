/**
 * 调试 API - 查看订单数据
 * 仅用于调试，生产环境应删除
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 获取所有已支付订单
    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 获取订单表结构
    const { data: columns, error: columnsError } = await supabaseAdmin
      .rpc('get_table_columns', { table_name: 'orders' })
      .single()

    return NextResponse.json({
      message: '订单调试信息',
      orderCount: orders?.length || 0,
      orders: orders?.map(o => ({
        id: o.id,
        order_no: o.order_no,
        user_id: o.user_id,
        user_id_type: typeof o.user_id,
        product_name: o.product_name,
        amount: o.amount,
        status: o.status,
        created_at: o.created_at
      })),
      // 如果有订单，分析 user_id 格式
      userIdAnalysis: orders?.map(o => {
        const userId = o.user_id
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)
        return {
          order_no: o.order_no,
          user_id: userId,
          isUUID,
          length: userId?.length,
          // 从订单号中提取用户ID
          userIdFromOrderNo: o.order_no?.split('_')[2]
        }
      })
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
