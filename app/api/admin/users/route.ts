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
        membership_status,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false })
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

    // 获取每个用户的交易统计和最后活跃时间
    const usersWithStats = await Promise.all(
      (users || []).map(async (user) => {
        // 获取用户的交易记录数量
        const { count: transactionCount, error: transactionError } = await supabaseAdmin
          .from('credit_transactions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.user_id)

        if (transactionError) {
          console.error('获取用户交易数量失败:', transactionError)
        }

        // 获取用户的最后活跃时间（最后一条交易记录的时间）
        const { data: lastTransaction, error: lastTransactionError } = await supabaseAdmin
          .from('credit_transactions')
          .select('created_at')
          .eq('user_id', user.user_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (lastTransactionError && lastTransactionError.code !== 'PGRST116') {
          console.error('获取最后交易时间失败:', lastTransactionError)
        }

        return {
          user_id: user.user_id,
          credits: user.credits || 0,
          is_pro: user.is_pro || false,
          membership_status: user.membership_status || 'free',
          created_at: user.created_at,
          lastActiveAt: lastTransaction?.created_at || user.created_at,
          transactionCount: transactionCount || 0
        }
      })
    )

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

  } catch (error: any) {
    console.error('获取用户列表失败:', error)
    return NextResponse.json(
      { error: '获取用户列表失败', details: error.message },
      { status: 500 }
    )
  }
}