import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// 需要身份验证的 API 路由前缀
const PROTECTED_API_ROUTES = [
  "/api/dify-chat",
  "/api/dify-upload",
  "/api/chat-session",
  "/api/save-message",
  "/api/save-essay-review",
  // 注意：/api/user/update 已移除，因为该 API 内部有完整的用户验证逻辑
]

// 公开的 API 路由（不需要验证）
const PUBLIC_API_ROUTES = [
  "/api/auth/",           // 认证相关接口
  "/api/payment/xunhupay/notify", // 支付回调
  "/api/providers",       // 公开的配置接口
  "/api/share",           // 分享功能
]

export async function updateSession(request: NextRequest) {
  const url = request.nextUrl
  const pathname = url.pathname
  const code = url.searchParams.get("code")

  // 处理 OAuth 回调
  if (code && !pathname.startsWith("/auth/callback")) {
    const callbackUrl = url.clone()
    callbackUrl.pathname = "/auth/callback"
    return NextResponse.redirect(callbackUrl)
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    },
  )

  // ========================================
  // 🔐 API 路由身份验证检查
  // ========================================
  
  // 检查是否是公开路由
  const isPublicRoute = PUBLIC_API_ROUTES.some(route => pathname.startsWith(route))
  if (isPublicRoute) {
    return supabaseResponse
  }

  // 检查是否是需要保护的 API 路由
  const isProtectedApiRoute = PROTECTED_API_ROUTES.some(route => pathname.startsWith(route))
  
  if (isProtectedApiRoute) {
    const bearerToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
    const { data: { user } } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser()

    // 浏览器可以伪造 X-User-Id；受保护接口只能信任已验证的 Supabase session。
    if (!user) {
      console.warn(`🚫 [Middleware] 未授权访问被拦截: ${pathname}`)
      return NextResponse.json(
        { error: "未授权访问，请先登录", code: "UNAUTHORIZED" },
        { status: 401 }
      )
    }
    
    // 记录访问日志
    console.log(`✅ [Middleware] 已授权访问: ${pathname} | User: ${user.id}`)
  }

  return supabaseResponse
}
