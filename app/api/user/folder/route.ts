import { NextResponse, type NextRequest } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string) {
  return UUID_PATTERN.test(value)
}

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function asFileSize(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return 0
  return Math.floor(numeric)
}

function ensureLearningUserId(userId: string) {
  if (!isUuid(userId)) {
    return NextResponse.json(
      { error: "学习资料夹仅支持已同步的 Supabase 用户账号", code: "UNSUPPORTED_USER_ID" },
      { status: 400 },
    )
  }
  return null
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request)
    if (auth.response) return auth.response

    const userId = auth.user!.id
    const unsupported = ensureLearningUserId(userId)
    if (unsupported) return unsupported

    const supabase = getSupabaseAdmin()
    const { data, error, count } = await supabase
      .from("user_files")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("[UserFolder] list failed:", error)
      return NextResponse.json({ error: "获取资料夹失败" }, { status: 500 })
    }

    return NextResponse.json({ files: data || [], total_count: count || 0 })
  } catch (error) {
    console.error("[UserFolder] GET exception:", error)
    const isConfigError = error instanceof Error && error.message === "缺少 Supabase 配置"
    return NextResponse.json(
      { error: isConfigError ? "资料夹服务未配置" : "获取资料夹失败" },
      { status: isConfigError ? 503 : 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request)
    if (auth.response) return auth.response

    const userId = auth.user!.id
    const unsupported = ensureLearningUserId(userId)
    if (unsupported) return unsupported

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "请求体格式错误" }, { status: 400 })
    }

    const filename = asNonEmptyString(body.filename)
    const fileType = asNonEmptyString(body.file_type)
    const storagePath = asNonEmptyString(body.storage_path)

    if (!filename || !fileType || !storagePath) {
      return NextResponse.json({ error: "filename、file_type、storage_path 为必填项" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("user_files")
      .insert({
        user_id: userId,
        filename,
        file_type: fileType,
        file_size: asFileSize(body.file_size),
        storage_path: storagePath,
        mime_type: asOptionalString(body.mime_type),
        subject: asOptionalString(body.subject),
      })
      .select("*")
      .single()

    if (error) {
      console.error("[UserFolder] create failed:", error)
      return NextResponse.json({ error: "创建资料记录失败" }, { status: 500 })
    }

    return NextResponse.json({ file: data }, { status: 201 })
  } catch (error) {
    console.error("[UserFolder] POST exception:", error)
    const isConfigError = error instanceof Error && error.message === "缺少 Supabase 配置"
    return NextResponse.json(
      { error: isConfigError ? "资料夹服务未配置" : "创建资料记录失败" },
      { status: isConfigError ? 503 : 500 },
    )
  }
}
