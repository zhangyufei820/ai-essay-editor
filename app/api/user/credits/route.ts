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

    console.log("🔍 [积分API] 查询用户积分")

    // 使用 Service Role Key 创建超级管理员客户端
    const supabaseAdmin = getSupabaseAdmin()
    const entitlementPromise = withTimeout(
      getUserEntitlementSummary(userId, {
        email: auth.user!.email || null,
        phone: auth.user!.phone || null,
        metadata: auth.user!.metadata || null,
      }),
      OPTIONAL_STATUS_TIMEOUT_MS,
      "user-credits.entitlement",
    ).catch((error) => {
      console.warn("[积分API] 权益合并降级:", error)
      return null
    })

    const baseCreditsPromise = withTimeout(
      Promise.resolve(
        supabaseAdmin
          .from('user_credits')
          .select('credits, is_pro')
          .eq('user_id', userId)
          .maybeSingle(),
      ),
      BASE_CREDITS_TIMEOUT_MS,
      "user-credits.base-credits",
    )
      .then((result) => ({ ok: true as const, result }))
      .catch((error) => ({ ok: false as const, error }))

    const [entitlement, baseCredits] = await Promise.all([
      entitlementPromise,
      baseCreditsPromise,
    ])

    if (entitlement) {
      return NextResponse.json({
        userId,
        credits: entitlement.credits,
        is_pro: entitlement.isPro,
        membership_status: entitlement.membershipStatus,
        entitlementUserId: entitlement.entitlementUserId,
        relatedUserIds: entitlement.relatedUserIds,
      })
    }

    if (!baseCredits.ok) {
      console.error("[积分API] 基础积分查询超时或失败:", baseCredits.error)
      return createSafeCreditsDegradedResponse({
        userId,
        code: isOperationTimeoutError(baseCredits.error) ? "CREDITS_TIMEOUT" : "CREDITS_QUERY_FAILED",
      })
    }

    // 查询积分
    const { data: creditData, error } = baseCredits.result

    if (error) {
      console.error(`❌ [积分API] 查询失败:`, error)
      return createSafeCreditsDegradedResponse({
        userId,
        code: "CREDITS_QUERY_FAILED",
      })
    }

    // 如果没有记录，自动创建
    if (!creditData) {
      console.log("🆕 [积分API] 用户无积分记录，自动创建...")
      
      const { data: newData, error: insertError } = await withTimeout(
        Promise.resolve(
          supabaseAdmin
            .from('user_credits')
            .upsert({
              user_id: userId,
              credits: 1000,
              is_pro: false
            })
            .select('credits, is_pro')
            .single(),
        ),
        BASE_CREDITS_TIMEOUT_MS,
        "user-credits.create-default",
      )

      if (insertError) {
        console.error(`❌ [积分API] 创建积分记录失败:`, insertError)
        // 即使创建失败，也返回默认值
        return NextResponse.json({
          userId,
          credits: 1000,
          is_pro: false,
          isNew: true,
        })
      }

      console.log(`✅ [积分API] 新用户积分初始化成功:`, newData)
      return NextResponse.json({
        userId,
        credits: newData?.credits || 1000,
        is_pro: newData?.is_pro || false,
        isNew: true,
      })
    }

    console.log(`✅ [积分API] 查询成功: credits=${creditData.credits}`)
    return NextResponse.json({
      userId,
      credits: creditData.credits,
      is_pro: creditData.is_pro,
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
