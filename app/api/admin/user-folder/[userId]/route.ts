import { NextResponse, type NextRequest } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string) {
  return UUID_PATTERN.test(value)
}

function getAdminUserIds() {
  return new Set(
    (process.env.ADMIN_USER_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  )
}

async function canViewUserFolder(viewerId: string, targetUserId: string) {
  if (getAdminUserIds().has(viewerId)) return true
  if (!isUuid(viewerId) || !isUuid(targetUserId)) return false

  const { data, error } = await getSupabaseAdmin()
    .from("teacher_students")
    .select("id")
    .eq("teacher_id", viewerId)
    .eq("student_id", targetUserId)
    .maybeSingle()

  if (error) {
    console.error("[AdminUserFolder] teacher binding check failed:", error)
    return false
  }

  return Boolean(data)
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> | { userId: string } },
) {
  try {
    const auth = await requireUser(request)
    if (auth.response) return auth.response

    const params = await context.params
    const targetUserId = decodeURIComponent(params.userId || "")
    if (!isUuid(targetUserId)) {
      return NextResponse.json({ error: "目标用户 ID 格式错误" }, { status: 400 })
    }

    const viewerId = auth.user!.id
    if (!(await canViewUserFolder(viewerId, targetUserId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const supabase = getSupabaseAdmin()
    const [filesResult, progressResult, sessionsResult, mistakesResult] = await Promise.all([
      supabase
        .from("user_files")
        .select("*")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("user_progress").select("*").eq("user_id", targetUserId).maybeSingle(),
      supabase
        .from("learning_sessions")
        .select("*")
        .eq("user_id", targetUserId)
        .order("started_at", { ascending: false })
        .limit(20),
      supabase
        .from("mistake_book")
        .select("*")
        .eq("user_id", targetUserId)
        .eq("mastered", false)
        .order("created_at", { ascending: false })
        .limit(20),
    ])

    if (filesResult.error) throw filesResult.error
    if (progressResult.error) throw progressResult.error
    if (sessionsResult.error) throw sessionsResult.error
    if (mistakesResult.error) throw mistakesResult.error

    return NextResponse.json({
      files: filesResult.data || [],
      progress: progressResult.data || null,
      recent_sessions: sessionsResult.data || [],
      active_mistakes: mistakesResult.data || [],
    })
  } catch (error) {
    console.error("[AdminUserFolder] GET failed:", error)
    const isConfigError = error instanceof Error && error.message === "缺少 Supabase 配置"
    return NextResponse.json(
      { error: isConfigError ? "用户资料夹管理服务未配置" : "获取用户资料夹失败" },
      { status: isConfigError ? 503 : 500 },
    )
  }
}
