import { type NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { requireUser } from "@/lib/auth/verified-user"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  try {
    // IP 限流：30次/分钟
    const { getClientIP, checkIpRateLimit, createRateLimitResponse } = await import('@/lib/rate-limit')
    const ip = getClientIP(request)
    const limitResult = checkIpRateLimit(ip, 30)
    if (!limitResult.allowed) {
      return createRateLimitResponse(limitResult.retryAfter!)
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "数据库未配置" }, { status: 503 })
    }

    const auth = await requireUser(request)
    if (auth.response) return auth.response
    const user = auth.user!

    const body = await request.json()
    const { id, title, preview, ai_model } = body
    const requestedId = typeof id === "string" && id.trim() ? id.trim() : null
    if (requestedId && !UUID_RE.test(requestedId)) {
      return NextResponse.json({ error: "会话 ID 格式无效" }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    if (requestedId) {
      const { data: existing, error: existingError } = await supabase
        .from("chat_sessions")
        .select("id,user_id")
        .eq("id", requestedId)
        .maybeSingle()

      if (existingError) throw existingError
      if (existing && existing.user_id !== user.id) {
        return NextResponse.json({ error: "无权访问该会话" }, { status: 403 })
      }
      if (existing) {
        const { data: session, error } = await supabase
          .from("chat_sessions")
          .update({
            title: title || "新对话",
            preview: preview || null,
            ai_model,
          })
          .eq("id", requestedId)
          .eq("user_id", user.id)
          .select()
          .single()

        if (error) throw error
        return NextResponse.json({ session })
      }
    }

    const { data: session, error } = await supabase
      .from("chat_sessions")
      .insert({
        ...(requestedId ? { id: requestedId } : {}),
        user_id: user.id,
        title: title || "新对话",
        preview: preview || null,
        ai_model,
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
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ sessions: [] }, { status: 200 })
    }

    const auth = await requireUser(request)
    if (auth.response) return auth.response
    const user = auth.user!
    const sessionId = request.nextUrl.searchParams.get("sessionId")?.trim()
    const limitParam = Number(request.nextUrl.searchParams.get("limit") || 30)
    const limit = Number.isFinite(limitParam) ? Math.min(50, Math.max(1, Math.round(limitParam))) : 30

    const supabase = createServiceRoleClient()
    if (sessionId) {
      const { data: session, error: sessionError } = await supabase
        .from("chat_sessions")
        .select("id,title,preview,ai_model,user_id,created_at")
        .eq("id", sessionId)
        .maybeSingle()

      if (sessionError) throw sessionError
      if (!session) return NextResponse.json({ error: "会话不存在" }, { status: 404 })
      if (session.user_id !== user.id) {
        return NextResponse.json({ error: "无权访问该会话" }, { status: 403 })
      }

      const { data: messages, error: messagesError } = await supabase
        .from("chat_messages")
        .select("id,role,content,created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })

      if (messagesError) throw messagesError
      const { user_id: _userId, ...safeSession } = session
      return NextResponse.json({ session: safeSession, messages: messages || [] })
    }

    const { data: sessions, error } = await supabase
      .from("chat_sessions")
      .select("id,title,preview,ai_model,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) throw error

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error("[v0] Get sessions error:", error)
    return NextResponse.json({ sessions: [] }, { status: 200 })
  }
}
