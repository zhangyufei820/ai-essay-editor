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
    await logAdminAction('view_users', token)

    // 获取查询参数
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '50')
    const search = searchParams.get('search') || ''

    // 使用 Service Role Key 绕过 RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 构建查询
    let query = supabaseAdmin
      .from('user_credits')
      .select(`
        user_id,
        credits,
        is_pro,
        updated_at
      `)
      .order('updated_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    // 如果有搜索参数，添加搜索条件
    if (search) {
      query = query.ilike('user_id', `%${search}%`)
    }

    const { data: users, error: usersError } = await query

    if (usersError) {
      console.error('获取用户列表失败:', usersError)
      return NextResponse.json({ error: '获取用户列表失败' }, { status: 500 })
    }

    // 获取用户总数（用于分页）
    let countQuery = supabaseAdmin
      .from('user_credits')
      .select('*', { count: 'exact', head: true })

    if (search) {
      countQuery = countQuery.ilike('user_id', `%${search}%`)
    }

    const { count: totalUsers, error: countError } = await countQuery

    if (countError) {
      console.error('获取用户总数失败:', countError)
    }

    const userIds = (users || []).map((user) => user.user_id).filter(Boolean)
    const transactionStats = new Map<string, { count: number; lastActiveAt?: string }>()

    if (userIds.length > 0) {
      const { data: transactions, error: transactionError } = await supabaseAdmin
        .from('credit_transactions')
        .select('user_id, created_at')
        .in('user_id', userIds)
        .order('created_at', { ascending: false })

      if (transactionError) {
        console.error('获取用户交易统计失败:', transactionError)
      } else {
        for (const transaction of transactions || []) {
          const stat = transactionStats.get(transaction.user_id) || { count: 0 }
          stat.count += 1
          stat.lastActiveAt ||= transaction.created_at
          transactionStats.set(transaction.user_id, stat)
        }
      }
    }

    const usersWithStats = (users || []).map((user) => {
      const stat = transactionStats.get(user.user_id)
      return {
        user_id: user.user_id,
        credits: user.credits || 0,
        is_pro: user.is_pro || false,
        updated_at: user.updated_at,
        lastActiveAt: stat?.lastActiveAt || user.updated_at,
        transactionCount: stat?.count || 0
      }
    })

    return NextResponse.json({
      success: true,
      data: usersWithStats,
      pagination: {
        page,
        pageSize,
        total: totalUsers || 0,
        totalPages: Math.ceil((totalUsers || 0) / pageSize)
      }
    })

  } catch (error) {
    console.error('获取用户列表失败:', error)
    return NextResponse.json(
      { error: '获取用户列表失败，请稍后重试' },
      { status: 500 }
    )
  }
}
