import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
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

export async function GET(request: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json({ sessions: [] }, { status: 200 })
    }

    // 🔥 支持 X-User-Id 头（用于 Authing 用户）- 优先使用header
    const userIdHeader = request.headers.get("X-User-Id")

    // 如果有 X-User-Id header，直接使用（Authing 用户场景）
    if (userIdHeader) {
      const supabase = await createServerClient()
      const { data: sessions, error } = await supabase
        .from("chat_sessions")
        .select("*")
        .eq("user_id", userIdHeader)
        .order("created_at", { ascending: false })

      if (error) throw error
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
