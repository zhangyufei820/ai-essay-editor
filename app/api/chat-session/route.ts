import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

export async function POST(request: NextRequest) {
  try {
    // IP 限流：30次/分钟
    const { getClientIP, checkIpRateLimit, createRateLimitResponse } = await import('@/lib/rate-limit')
    const ip = getClientIP(request)
    const limitResult = checkIpRateLimit(ip, 30)
    if (!limitResult.allowed) {
      return createRateLimitResponse(limitResult.retryAfter!)
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json({ error: "数据库未配置" }, { status: 503 })
    }

    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 })
    }

    const body = await request.json()
    const { title, processing_mode, ai_provider, ai_model } = body

    const { data: session, error } = await supabase
      .from("chat_sessions")
      .insert({
        user_id: user.id,
        title: title || "新对话",
        processing_mode,
        ai_provider,
        ai_model,
        date: Date.now(),
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ session })
  } catch (error) {
    console.error("[v0] Create session error:", error)
    return NextResponse.json({ error: "创建会话失败" }, { status: 500 })
  }
}

// 🔥 创建使用 Service Role Key 的 Supabase 客户端（绕过 RLS）
function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json({ sessions: [] }, { status: 200 })
    }

    // 🔥 支持 X-User-Id 头（用于 Authing 用户）- 优先使用header
    const userIdHeader = request.headers.get("X-User-Id")
    console.log("📡 [chat-session API] X-User-Id:", userIdHeader, "| 有header:", !!userIdHeader)

    // 如果有 X-User-Id header，使用 Service Role Key 绕过 RLS
    if (userIdHeader) {
      const supabase = createServiceRoleClient()
      const { data: sessions, error } = await supabase
        .from("chat_sessions")
        .select("*")
        .eq("user_id", userIdHeader)
        .order("created_at", { ascending: false })

      console.log("📡 [chat-session API] 查询结果:", sessions?.length || 0, "条| error:", error)

      if (error) {
        console.error("[v0] Get sessions error (Service Role):", error)
        throw error
      }
      return NextResponse.json({ sessions })
    }

    // 否则尝试 Supabase 认证
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 })
    }

    const { data: sessions, error } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) throw error

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error("[v0] Get sessions error:", error)
    return NextResponse.json({ sessions: [] }, { status: 200 })
  }
}
