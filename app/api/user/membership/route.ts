/**
 * 会员状态检查 API
 *
 * 使用 Service Role Key 绕过 RLS，准确检查用户是否为付费会员
 *
 * 🔥 修复：支持 GET (?user_id=) 和 POST (JSON body) 两种调用方式
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('缺少 Supabase 配置')
  return createClient(url, key)
}

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

function getPureNumbers(str: any) {
  if (!str) return ''
  return String(str).replace(/\D/g, '')
}

async function checkMembership(userId: string) {
  const supabaseAdmin = getSupabaseAdmin()

  // 策略1: 直接用原始 userId 查询订单
  let orders: any[] = []
  const variants = [userId, userId?.toLowerCase?.(), userId?.toUpperCase?.()].filter(Boolean)

  for (const tryId of variants) {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('id, status, amount, product_name, created_at, order_no, user_id')
      .eq('user_id', tryId)
      .eq('status', 'paid')
      .gt('amount', 0)
      .order('created_at', { ascending: false })
      .limit(5)
    if (!error && data?.length) { orders = data; break }
  }

  // 策略2: 订单号模糊匹配
  if (!orders.length) {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('id, status, amount, product_name, created_at, order_no, user_id')
      .like('order_no', `%_${userId}`)
      .eq('status', 'paid')
      .gt('amount', 0)
      .order('created_at', { ascending: false })
      .limit(5)
    if (!error && data?.length) orders = data
  }

  // 策略3: 非 UUID 则按手机/邮箱匹配 Supabase 用户
  if (!orders.length && !isUUID(userId)) {
    const search = getPureNumbers(userId)
    if (search.length >= 6) {
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
      if (!listError && users) {
        const target = users.find((u: any) => {
          const phone = getPureNumbers(u.phone)
          const email = getPureNumbers(u.email)
          const meta = getPureNumbers(u.user_metadata?.phone || '')
          return [phone, email, meta].some(n => n && (n.includes(search) || search.includes(n)))
        })
        if (target) {
          const { data, error } = await supabaseAdmin
            .from('orders')
            .select('id, status, amount, product_name, created_at, order_no, user_id')
            .eq('user_id', target.id)
            .eq('status', 'paid')
            .gt('amount', 0)
            .order('created_at', { ascending: false })
            .limit(5)
          if (!error && data?.length) orders = data
        }
      }
    }
  }

  // 策略4: 全量搜索订单号
  if (!orders.length) {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('id, status, amount, product_name, created_at, order_no, user_id')
      .eq('status', 'paid').gt('amount', 0)
      .order('created_at', { ascending: false }).limit(100)
    if (!error && data) {
      const matched = data.filter(o =>
        (o.order_no && o.order_no.includes(userId)) || o.user_id === userId
      )
      if (matched.length) orders = matched.slice(0, 5)
    }
  }

  // 策略5: 检查 is_pro 字段
  let isPro = false, hasHighCredits = false
  const { data: creditsData, error: creditsError } = await supabaseAdmin
    .from('user_credits').select('credits, is_pro, user_id').eq('user_id', userId).single()
  if (!creditsError && creditsData) {
    if (creditsData.is_pro === true) isPro = true
    if (creditsData.credits >= 1000) hasHighCredits = true
  }

  const isPaidMember = isPro || orders.length > 0 || hasHighCredits
  return NextResponse.json({
    isPaidMember,
    orderCount: orders.length,
    latestOrder: orders[0] || null
  })
}

// GET — query param: ?user_id=
export async function GET(req: NextRequest) {
  const userId = new URL(req.url).searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: '缺少 userId' }, { status: 400 })
  try {
    return await checkMembership(userId)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST — JSON body: { userId }
export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json()
    if (!userId) return NextResponse.json({ error: '缺少 userId' }, { status: 400 })
    return await checkMembership(userId)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
