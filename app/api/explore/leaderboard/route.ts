import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { publicShareSelect, toPublicShare } from "@/lib/sharing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function periodStart(period: string | null) {
  const date = new Date()
  if (period === "month") date.setDate(date.getDate() - 30)
  else date.setDate(date.getDate() - 7)
  return date.toISOString()
}

export async function GET(request: NextRequest) {
  try {
    const period = new URL(request.url).searchParams.get("period")
    const { data, error } = await getSupabaseAdmin()
      .from("shared_contents")
      .select(publicShareSelect())
      .eq("status", "published")
      .eq("visibility", "public")
      .gte("created_at", periodStart(period))
      .order("like_count", { ascending: false })
      .order("view_count", { ascending: false })
      .limit(10)

    if (error) {
      if (error.code === "42P01") return NextResponse.json({ items: [] })
      throw error
    }

    return NextResponse.json({ items: (data || []).map((row: any) => toPublicShare(row)), period: period || "week" })
  } catch (error) {
    console.error("[ExploreLeaderboard] failed:", error)
    return NextResponse.json({ error: "获取排行榜失败" }, { status: 500 })
  }
}
