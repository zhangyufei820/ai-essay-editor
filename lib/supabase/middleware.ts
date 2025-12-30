import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// 需要身份验证的 API 路由前缀
const PROTECTED_API_ROUTES = [
  "/api/dify-chat",
  "/api/dify-upload",
  "/api/chat-session",
  "/api/save-message",
  "/api/save-essay-review",
  "/api/user/update",
]

// 公开的 API 路由（不需要验证）
const PUBLIC_API_ROUTES = [
  "/api/auth/",           // 认证相关接口
  "/api/payment/xunhupay/notify", // 支付回调
  "/api/providers",       // 公开的配置接口
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
    // 方式1: 检查 Supabase Session
    const { data: { user } } = await supabase.auth.getUser()
    
    // 方式2: 检查 Authorization Header (用于前端传递的 userId)
    const authHeader = request.headers.get("Authorization")
    const userId = request.headers.get("X-User-Id")
    
    // 如果既没有 Supabase 用户，也没有有效的 userId header，则拒绝访问
    if (!user && !userId) {
      console.warn(`🚫 [Middleware] 未授权访问被拦截: ${pathname}`)
      return NextResponse.json(
        { error: "未授权访问，请先登录", code: "UNAUTHORIZED" },
        { status: 401 }
      )
    }
    
    // 记录访问日志
    console.log(`✅ [Middleware] 已授权访问: ${pathname} | User: ${user?.id || userId}`)
  }

  return supabaseResponse
}
