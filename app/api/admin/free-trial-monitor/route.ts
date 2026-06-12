import { NextResponse, type NextRequest } from "next/server"
import { logAdminAction, verifyAdminRequest } from "@/lib/admin-auth"
import { getAllRuntimeFlags, setRuntimeConfig, RUNTIME_CONFIG_KEYS } from "@/lib/free-trial-runtime-config"
import { logger } from "@/lib/logger"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ACTION_TO_KEY: Record<string, string> = {
  enable_campaign: RUNTIME_CONFIG_KEYS.campaign,
  disable_campaign: RUNTIME_CONFIG_KEYS.campaign,
  enable_consumption: RUNTIME_CONFIG_KEYS.consumption,
  disable_consumption: RUNTIME_CONFIG_KEYS.consumption,
  enable_auto_prompt: RUNTIME_CONFIG_KEYS.autoPrompt,
  disable_auto_prompt: RUNTIME_CONFIG_KEYS.autoPrompt,
  enable_monitor: RUNTIME_CONFIG_KEYS.monitor,
  disable_monitor: RUNTIME_CONFIG_KEYS.monitor,
}

function actionEnabledValue(action: string): boolean | null {
  if (action.startsWith("enable_")) return true
  if (action.startsWith("disable_")) return false
  return null
}

async function loadMonitorState() {
  const supabase = getSupabaseAdmin()
  const [runtimeFlags, runs, incidents, openIncidents] = await Promise.all([
    getAllRuntimeFlags(),
    supabase
      .from("monitor_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20),
    supabase
      .from("monitor_incidents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("monitor_incidents")
      .select("*")
      .eq("status", "open")
      .in("severity", ["p0", "p1"])
      .order("created_at", { ascending: false }),
  ])

  if (runs.error) throw runs.error
  if (incidents.error) throw incidents.error
  if (openIncidents.error) throw openIncidents.error

  const recentRuns = runs.data || []
  return {
    runtimeFlags,
    recentRuns,
    recentIncidents: incidents.data || [],
    openIncidents: openIncidents.data || [],
    hasOpenP0P1: (openIncidents.data || []).length > 0,
    lastRunAt: recentRuns[0]?.started_at || null,
    lastRunStatus: recentRuns[0]?.status || null,
  }
}

export async function GET(request: NextRequest) {
  const adminAccess = await verifyAdminRequest(request)
  if (!adminAccess.ok) {
    return NextResponse.json({ ok: false, error: "无管理员权限" }, { status: 403 })
  }

  try {
    await logAdminAction("view_free_trial_monitor", adminAccess.token, {
      authMode: adminAccess.authMode,
      adminUserId: adminAccess.userId,
    })

    const state = await loadMonitorState()
    return NextResponse.json({ ok: true, ...state })
  } catch (error) {
    logger.error("[admin/free-trial-monitor] GET failed", error)
    return NextResponse.json({ ok: false, error: "获取监控状态失败" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const adminAccess = await verifyAdminRequest(request)
  if (!adminAccess.ok) {
    return NextResponse.json({ ok: false, error: "无管理员权限" }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => null)
    const action = typeof body?.action === "string" ? body.action : ""
    const reason = typeof body?.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 240)
      : "admin_manual_runtime_flag_update"
    const key = ACTION_TO_KEY[action]
    const enabled = actionEnabledValue(action)

    if (!key || enabled === null) {
      return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 })
    }

    const updatedBy = adminAccess.userId || adminAccess.token?.slice(0, 20) || "admin"
    const result = await setRuntimeConfig(
      key,
      {
        enabled,
        reason,
        updatedAt: new Date().toISOString(),
        updatedBy,
      },
      updatedBy,
    )

    await logAdminAction("update_free_trial_runtime_flag", adminAccess.token, {
      authMode: adminAccess.authMode,
      adminUserId: adminAccess.userId,
      action,
      key,
      enabled,
      success: result.success,
      error: result.success ? null : "update_failed",
    })

    if (!result.success) {
      return NextResponse.json({ ok: false, error: "更新监控开关失败" }, { status: 500 })
    }

    const state = await loadMonitorState()
    return NextResponse.json({ ok: true, updated: result.data, ...state })
  } catch (error) {
    logger.error("[admin/free-trial-monitor] POST failed", error)
    return NextResponse.json({ ok: false, error: "更新监控开关失败" }, { status: 500 })
  }
}
