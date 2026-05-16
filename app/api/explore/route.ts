import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { publicShareSelect, toPublicShare } from "@/lib/sharing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SORTS = new Set(["latest", "popular", "featured"])

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category") || "all"
    const sort = SORTS.has(searchParams.get("sort") || "") ? searchParams.get("sort")! : "latest"
    const page = Math.max(1, Number(searchParams.get("page") || 1))
    const pageSize = Math.min(30, Math.max(6, Number(searchParams.get("pageSize") || 12)))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = getSupabaseAdmin()
      .from("shared_contents")
      .select(publicShareSelect(), { count: "exact" })
      .eq("status", "published")
      .eq("visibility", "public")

    if (category !== "all") query = query.eq("content_type", category)
    if (sort === "featured") {
      query = query.eq("is_featured", true).order("is_pinned", { ascending: false }).order("created_at", { ascending: false })
    } else if (sort === "popular") {
      query = query.order("like_count", { ascending: false }).order("created_at", { ascending: false })
    } else {
      query = query.order("created_at", { ascending: false })
    }

    const { data, error, count } = await query.range(from, to)
    if (error) {
      console.error("[Explore] query failed:", error)
      if (error.code === "42P01") return NextResponse.json({ items: [], total_count: 0, page, pageSize })
      return NextResponse.json({ error: "获取创作广场失败" }, { status: 500 })
    }

    return NextResponse.json({
      items: (data || []).map((row: any) => toPublicShare(row)),
      total_count: count || 0,
      page,
      pageSize,
      has_more: (count || 0) > to + 1,
    })
  } catch (error) {
    console.error("[Explore] failed:", error)
    return NextResponse.json({ error: "获取创作广场失败" }, { status: 500 })
  }
}
