import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.log("[v0] Supabase not configured, skipping essay review save")
      return NextResponse.json({ review: { id: Date.now().toString() } }, { status: 200 })
    }

    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 })
    }

    const body = await request.json()
    const { session_id, original_text, reviewed_text, writer_style, feedback, score } = body

    const { data: review, error } = await supabase
      .from("essay_reviews")
      .insert({
        user_id: user.id,
        session_id,
        original_text,
        reviewed_text,
        writer_style,
        feedback,
        score,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ review })
  } catch (error) {
    console.error("[v0] Save essay review error:", error)
    return NextResponse.json({ error: "保存批改记录失败" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json({ reviews: [] }, { status: 200 })
    }

    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 })
    }

    const { data: reviews, error } = await supabase
      .from("essay_reviews")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) throw error

    return NextResponse.json({ reviews })
  } catch (error) {
    console.error("[v0] Get essay reviews error:", error)
    return NextResponse.json({ reviews: [] }, { status: 200 })
  }
}
