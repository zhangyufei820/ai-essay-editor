import { NextResponse, type NextRequest } from "next/server"
import { logAdminAction, verifyAdminRequest } from "@/lib/admin-auth"
import { logger } from "@/lib/logger"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const EXPORT_CONFIG = {
  survey_responses: {
    dateColumn: "created_at",
    columns: ["id", "user_id", "template_id", "survey_date", "answers_json", "quality_score", "streak_day", "metadata", "created_at"],
  },
  trial_credit_usages: {
    dateColumn: "created_at",
    columns: ["id", "user_id", "grant_id", "usage_date", "action_type", "amount", "reference_id", "metadata", "created_at"],
  },
  free_trial_grants: {
    dateColumn: "created_at",
    columns: ["id", "user_id", "grant_type", "start_at", "end_at", "daily_quota", "total_quota", "status", "requires_daily_survey", "metadata", "created_at", "updated_at"],
  },
  campaign_events: {
    dateColumn: "created_at",
    columns: ["id", "user_id", "anonymous_id", "event_name", "event_date", "page_path", "metadata", "created_at"],
  },
} as const

type ExportType = keyof typeof EXPORT_CONFIG
type ExportRange = "today" | "7d" | "30d" | "all"

function isExportType(value: string | null): value is ExportType {
  return Boolean(value && value in EXPORT_CONFIG)
}

function isExportRange(value: string | null): value is ExportRange {
  return value === "today" || value === "7d" || value === "30d" || value === "all"
}

function getRangeStart(range: ExportRange): string | null {
  if (range === "all") return null

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (range === "7d") start.setDate(start.getDate() - 6)
  if (range === "30d") start.setDate(start.getDate() - 29)
  return start.toISOString()
}

function csvEscape(value: unknown): string {
  if (value == null) return ""
  const text = typeof value === "object" ? JSON.stringify(value) : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(columns: readonly string[], rows: Array<Record<string, unknown>>): string {
  const lines = [
    columns.map(csvEscape).join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ]
  return `${lines.join("\n")}\n`
}

export async function GET(request: NextRequest) {
  const adminAccess = await verifyAdminRequest(request)
  if (!adminAccess.ok) {
    return NextResponse.json({ ok: false, error: "无管理员权限" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const typeParam = searchParams.get("type")
  const rangeParam = searchParams.get("range") || "7d"

  if (!isExportType(typeParam)) {
    return NextResponse.json({ ok: false, error: "导出类型无效" }, { status: 400 })
  }

  if (!isExportRange(rangeParam)) {
    return NextResponse.json({ ok: false, error: "导出时间范围无效" }, { status: 400 })
  }

  const config = EXPORT_CONFIG[typeParam]

  try {
    await logAdminAction("export_trial_dashboard_csv", adminAccess.token, {
      authMode: adminAccess.authMode,
      adminUserId: adminAccess.userId,
      type: typeParam,
      range: rangeParam,
    })

    let query = getSupabaseAdmin()
      .from(typeParam)
      .select(config.columns.join(","))
      .order(config.dateColumn, { ascending: false })
      .limit(5000)

    const rangeStart = getRangeStart(rangeParam)
    if (rangeStart) {
      query = query.gte(config.dateColumn, rangeStart)
    }

    const { data, error } = await query
    if (error) throw error

    const csv = toCsv(config.columns, (data || []) as unknown as Array<Record<string, unknown>>)
    const filename = `${typeParam}_${rangeParam}_${new Date().toISOString().slice(0, 10)}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    logger.error("[admin/trial-dashboard/export] failed", { type: typeParam, range: rangeParam, error })
    return NextResponse.json({ ok: false, error: "导出失败" }, { status: 500 })
  }
}
