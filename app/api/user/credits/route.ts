import { ensureCreditAccount } from "@/lib/credit-account"
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth/verified-user'
import { isOperationTimeoutError, withTimeout } from '@/lib/server-timeout'
import { getUserEntitlementSummary } from '@/lib/user-entitlements'

/**
 * 🎯 用户积分 API
 * 
 * GET /api/user/credits - 查询当前已验证用户积分
 * POST /api/user/credits - 已禁用。积分变更必须由后端业务 API 根据统一计费配置发起。
 * 
 * 使用 Service Role Key，绕过 RLS 限制
 */

// 创建超级管理员客户端
const getSupabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('缺少 Supabase 配置')
  }
  return createClient(url, key)
}

const AUTH_TIMEOUT_MS = 5_000
const BASE_CREDITS_TIMEOUT_MS = 4_000
const OPTIONAL_STATUS_TIMEOUT_MS = 2_500

function createSafeCreditsDegradedResponse({
  userId,
  code,
}: {
  userId: string | null
  code: string
}) {
  return NextResponse.json({
    userId,
    credits: 0,
    is_pro: false,
    degraded: true,
    creditStatus: "unavailable",
    code,
  })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await withTimeout(requireUser(request), AUTH_TIMEOUT_MS, "user-credits.auth")
    if (auth.response) return auth.response
    const userId = auth.user!.id

    const account = await withTimeout(
      ensureCreditAccount(getSupabaseAdmin(), userId),
      BASE_CREDITS_TIMEOUT_MS,
      "user-credits.account",
    )
    // The account RPC finishes any pending transfer before the read-only
    // membership resolver runs, so both calls observe the canonical balance.
    const entitlement = await withTimeout(
      getUserEntitlementSummary(account.credit_user_id, {
        email: auth.user!.email || null,
        phone: auth.user!.phone || null,
      }),
      OPTIONAL_STATUS_TIMEOUT_MS,
      "user-credits.entitlement",
    ).catch(() => null)

    return NextResponse.json({
      userId,
      credits: account.credits,
      is_pro: entitlement?.isPro ?? account.is_pro,
      membership_status: entitlement?.membershipStatus ?? null,
      entitlementUserId: account.credit_user_id,
      relatedUserIds: entitlement?.relatedUserIds ?? [account.credit_user_id],
      isNew: account.initialized,
    })

  } catch (error) {
    console.error('[积分API] 异常:', error)
    if (isOperationTimeoutError(error)) {
      return createSafeCreditsDegradedResponse({
        userId: null,
        code: error.code,
      })
    }
    const message = error instanceof Error && error.message === '缺少 Supabase 配置'
      ? '积分服务未配置'
      : 'Internal Server Error'
    if (message === '积分服务未配置') {
      return createSafeCreditsDegradedResponse({
        userId: null,
        code: "CREDITS_SERVICE_UNCONFIGURED",
      })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return NextResponse.json(
    { error: '积分变更接口已禁用，请通过支付、邀请、分享或 AI 生成业务接口完成积分变更' },
    { status: 405, headers: { Allow: 'GET' } },
  )
}
