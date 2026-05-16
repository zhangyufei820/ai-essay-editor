/**
 * 会员状态检查 API
 *
 * 使用 Service Role Key 绕过 RLS，准确检查用户是否为付费会员
 *
 * 🔥 修复：支持 GET (?user_id=) 和 POST (JSON body) 两种调用方式
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { resolveMembershipStatus } from '@/lib/products'
import { requireUser } from '@/lib/auth/verified-user'

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

function collectIdentifierValues(values: Array<unknown>) {
  const identifiers = new Set<string>()
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      identifiers.add(value.trim())
    }
  }
  return Array.from(identifiers)
}

async function resolveRelatedUserIds(supabaseAdmin: any, userId: string, identifiers: string[]) {
  const related = new Set<string>([userId])
  const searchValues = collectIdentifierValues([
    userId,
    ...identifiers,
  ])

  for (const value of searchValues) {
    const digits = getPureNumbers(value)
    const shouldSearchByDigits = digits.length >= 6

    if (shouldSearchByDigits) {
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
      if (!listError && users) {
        for (const user of users) {
          const candidates = [
            getPureNumbers(user.phone),
            getPureNumbers(user.email),
            getPureNumbers(user.user_metadata?.phone),
            getPureNumbers(user.user_metadata?.mobile),
          ]
          if (candidates.some(candidate => candidate && (candidate.includes(digits) || digits.includes(candidate)))) {
            related.add(user.id)
          }
        }
      }
    }

    for (const table of ['profiles', 'user_profiles']) {
      const { data } = await supabaseAdmin
        .from(table)
        .select(table === 'profiles' ? 'id, phone, email' : 'user_id, phone, email')
        .or(`phone.eq.${value},phone.ilike.%${value}%,email.eq.${value}`)
        .limit(20)

      for (const row of data || []) {
        const relatedId = table === 'profiles' ? row.id : row.user_id
        if (relatedId) related.add(relatedId)
      }

      if (shouldSearchByDigits) {
        const { data: phoneRows } = await supabaseAdmin
          .from(table)
          .select(table === 'profiles' ? 'id, phone, email' : 'user_id, phone, email')
          .ilike('phone', `%${digits}%`)
          .limit(20)

        for (const row of phoneRows || []) {
          const relatedId = table === 'profiles' ? row.id : row.user_id
          if (relatedId) related.add(relatedId)
        }
      }
    }
  }

  return Array.from(related)
}

async function checkMembership(userId: string, identifiers: string[] = []) {
  const supabaseAdmin = getSupabaseAdmin()
  const relatedUserIds = await resolveRelatedUserIds(supabaseAdmin, userId, identifiers)

  // 策略1: 直接用原始 userId 查询订单
  let orders: any[] = []
  const variants = relatedUserIds
    .flatMap(id => [id, id?.toLowerCase?.(), id?.toUpperCase?.()])
    .filter(Boolean)

  for (const tryId of variants) {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('id, status, amount, product_name, product_id, created_at, order_no, user_id')
      .eq('user_id', tryId)
      .eq('status', 'paid')
      .gt('amount', 0)
      .order('created_at', { ascending: false })
      .limit(5)
    if (!error && data?.length) { orders = data; break }
  }

  // 策略2: 订单号模糊匹配
  if (!orders.length) {
    for (const relatedUserId of relatedUserIds) {
      const { data, error } = await supabaseAdmin
        .from('orders')
        .select('id, status, amount, product_name, product_id, created_at, order_no, user_id')
        .like('order_no', `%_${relatedUserId}`)
        .eq('status', 'paid')
        .gt('amount', 0)
        .order('created_at', { ascending: false })
        .limit(5)
      if (!error && data?.length) {
        orders = data
        break
      }
    }
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
            .select('id, status, amount, product_name, product_id, created_at, order_no, user_id')
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
      .select('id, status, amount, product_name, product_id, created_at, order_no, user_id')
      .eq('status', 'paid').gt('amount', 0)
      .order('created_at', { ascending: false }).limit(100)
    if (!error && data) {
      const matched = data.filter(o =>
        (o.order_no && o.order_no.includes(userId)) || o.user_id === userId
      )
      if (matched.length) orders = matched.slice(0, 5)
    }
  }

  // 策略5: 检查 is_pro 字段和 membership_status
  let isPro = false
  let membershipStatus: string | null = null
  let creditsUserId: string | null = null
  for (const relatedUserId of relatedUserIds) {
    const { data: creditsData, error: creditsError } = await supabaseAdmin
      .from('user_credits').select('credits, is_pro, user_id').eq('user_id', relatedUserId).maybeSingle()
    if (!creditsError && creditsData) {
      if (creditsData.is_pro === true) isPro = true
      membershipStatus = resolveMembershipStatus(creditsData)
      creditsUserId = creditsData.user_id
      if (isPro) break
    }
  }

  const isPaidMember = isPro || orders.length > 0
  const membershipUserId = orders[0]?.user_id || creditsUserId || userId

  // 从订单或用户积分记录中获取订阅类型
  let type = "免费"
  if (orders.length > 0 && orders[0]?.product_id) {
    // 优先从最新订单获取产品类型
    type = orders[0].product_id
  } else if (isPro && membershipStatus) {
    // 检查用户积分记录中的会员标识
    type = membershipStatus
  }

  return NextResponse.json({
    isPaidMember,
    orderCount: orders.length,
    latestOrder: orders[0] || null,
    userId: membershipUserId,
    relatedUserIds,
    type // 返回订阅类型: "免费", "basic", "pro", "premium"
  })
}

// GET — query param: ?user_id=
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req)
    if (auth.response) return auth.response
    const requestedUserId = new URL(req.url).searchParams.get('user_id')
    if (requestedUserId && requestedUserId !== auth.user!.id) {
      return NextResponse.json({ error: '无权查询该用户会员状态' }, { status: 403 })
    }
    return await checkMembership(auth.user!.id, [
      auth.user!.phone || '',
      auth.user!.email || '',
      typeof auth.user!.metadata?.phone === 'string' ? auth.user!.metadata.phone : '',
      typeof auth.user!.metadata?.mobile === 'string' ? auth.user!.metadata.mobile : '',
    ])
  } catch (error: any) {
    const status = error?.message === '缺少 Supabase 配置' ? 503 : 500
    return NextResponse.json({ error: status === 503 ? '会员服务未配置' : '查询会员状态失败' }, { status })
  }
}

// POST — JSON body: { userId }
export async function POST(req: NextRequest) {
  try {
    // IP 限流：30次/分钟
    const { getClientIP, checkIpRateLimit, createRateLimitResponse } = await import('@/lib/rate-limit')
    const ip = getClientIP(req)
    const limitResult = checkIpRateLimit(ip, 30)
    if (!limitResult.allowed) {
      return createRateLimitResponse(limitResult.retryAfter!)
    }
    const auth = await requireUser(req)
    if (auth.response) return auth.response
    const { userId } = await req.json()
    if (userId && userId !== auth.user!.id) {
      return NextResponse.json({ error: '无权查询该用户会员状态' }, { status: 403 })
    }
    return await checkMembership(auth.user!.id, [
      auth.user!.phone || '',
      auth.user!.email || '',
      typeof auth.user!.metadata?.phone === 'string' ? auth.user!.metadata.phone : '',
      typeof auth.user!.metadata?.mobile === 'string' ? auth.user!.metadata.mobile : '',
    ])
  } catch (error: any) {
    const status = error?.message === '缺少 Supabase 配置' ? 503 : 500
    return NextResponse.json({ error: status === 503 ? '会员服务未配置' : '查询会员状态失败' }, { status })
  }
}
