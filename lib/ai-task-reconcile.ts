import { createClient } from "@supabase/supabase-js"
import { sanitizeForTrace } from "@/lib/ai-task-trace"

type StaleTaskStatus = "queued" | "running"
type ReconciledTaskStatus = "succeeded" | "failed" | "cancelled" | "timeout"

export type AiTaskRunForReconcile = {
  id: string
  user_id?: string | null
  model?: string | null
  kind?: string | null
  status: StaleTaskStatus | string
  stage?: string | null
  progress?: number | null
  error_code?: string | null
  error_message?: string | null
  metadata?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
}

export type ReconcileDecision = {
  toStatus: ReconciledTaskStatus
  stage: string
  progress: number
  reason: string
  errorCode: string | null
  errorMessage: string | null
}

export type ReconcileChange = {
  id: string
  model: string
  kind: string
  fromStatus: string
  toStatus: ReconciledTaskStatus
  previousStage: string | null
  stage: string
  reason: string
  updatedAt: string | null
}

export type ReconcileAiTaskRunsResult = {
  dryRun: boolean
  cutoff: string
  scanned: number
  reconciled: number
  skipped: number
  byStatus: Record<string, number>
  byModel: Record<string, number>
  changes: ReconcileChange[]
  errors: string[]
}

const DEFAULT_OLDER_THAN_MS = 60 * 60 * 1000
const MAX_LIMIT = 500

const COMPLETED_STAGE_PATTERNS = [
  /任务(?:已)?完成/,
  /生成完成/,
  /消息生成完成/,
  /工作流已完成/,
  /已收到结果/,
  /整理完成/,
]

const CANCELLED_STAGE_PATTERNS = [
  /客户端连接中断/,
  /浏览器或网络连接.*中断/,
  /client.*abort/i,
  /connection.*closed/i,
]

const FAILED_STAGE_PATTERNS = [
  /失败/,
  /错误/,
  /异常/,
  /超时/,
  /timeout/i,
  /failed/i,
  /error/i,
]

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("缺少 Supabase 配置")
  }
  return createClient(url, key)
}

function matchesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value))
}

function taskSignal(task: AiTaskRunForReconcile) {
  return [
    task.stage || "",
    task.error_code || "",
    task.error_message || "",
  ].join("\n")
}

export function classifyStaleAiTaskRun(task: AiTaskRunForReconcile): ReconcileDecision {
  const signal = taskSignal(task)

  if (matchesAny(signal, CANCELLED_STAGE_PATTERNS)) {
    return {
      toStatus: "cancelled",
      stage: "客户端连接中断，状态已自动收敛",
      progress: Math.max(0, Math.min(100, Number(task.progress || 0))),
      reason: "client_disconnected",
      errorCode: "CLIENT_CONNECTION_CLOSED",
      errorMessage: "客户端连接中断，任务已自动结束",
    }
  }

  if (task.error_code || task.error_message || matchesAny(signal, FAILED_STAGE_PATTERNS)) {
    return {
      toStatus: "failed",
      stage: "任务异常结束，状态已自动收敛",
      progress: 100,
      reason: "stale_error_signal",
      errorCode: task.error_code || "AI_TASK_STALE_FAILED",
      errorMessage: task.error_message || "任务长时间停留在异常阶段，系统已自动收敛",
    }
  }

  if (matchesAny(signal, COMPLETED_STAGE_PATTERNS)) {
    return {
      toStatus: "succeeded",
      stage: "任务已完成，状态已自动收敛",
      progress: 100,
      reason: "completed_stage_stale",
      errorCode: null,
      errorMessage: null,
    }
  }

  return {
    toStatus: "timeout",
    stage: "任务长时间未完成，已自动超时",
    progress: 100,
    reason: task.status === "queued" ? "queued_stale_timeout" : "running_stale_timeout",
    errorCode: "AI_TASK_STALE_TIMEOUT",
    errorMessage: "任务长时间未完成，系统已自动结束",
  }
}

function buildPatch(task: AiTaskRunForReconcile, decision: ReconcileDecision, cutoff: string) {
  const now = new Date().toISOString()
  const metadata = task.metadata && typeof task.metadata === "object" ? task.metadata : {}

  return {
    status: decision.toStatus,
    stage: decision.stage,
    progress: decision.progress,
    error_code: decision.errorCode,
    error_message: decision.errorMessage,
    metadata: sanitizeForTrace({
      ...metadata,
      reconciled_from_status: task.status,
      reconciled_from_stage: task.stage || null,
      reconciled_reason: decision.reason,
      reconciled_at: now,
      reconciled_cutoff: cutoff,
    }),
    completed_at: now,
    updated_at: now,
  }
}

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] || 0) + 1
}

export async function reconcileStaleAiTaskRuns(options: {
  dryRun?: boolean
  olderThanMs?: number
  limit?: number
} = {}): Promise<ReconcileAiTaskRunsResult> {
  const supabase = getSupabaseAdmin()
  const dryRun = options.dryRun ?? true
  const olderThanMs = Math.max(30 * 60 * 1000, options.olderThanMs ?? DEFAULT_OLDER_THAN_MS)
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.round(options.limit ?? 100)))
  const cutoff = new Date(Date.now() - olderThanMs).toISOString()
  const result: ReconcileAiTaskRunsResult = {
    dryRun,
    cutoff,
    scanned: 0,
    reconciled: 0,
    skipped: 0,
    byStatus: {},
    byModel: {},
    changes: [],
    errors: [],
  }

  const { data: tasks, error } = await supabase
    .from("ai_task_runs")
    .select("id,user_id,model,kind,status,stage,progress,error_code,error_message,metadata,created_at,updated_at")
    .in("status", ["queued", "running"])
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(limit)

  if (error) {
    result.errors.push(error.message)
    return result
  }

  result.scanned = tasks?.length || 0

  for (const task of tasks || []) {
    const requestId = String(task.id || "")
    if (!requestId) {
      result.skipped += 1
      continue
    }

    const decision = classifyStaleAiTaskRun(task as AiTaskRunForReconcile)
    const model = String(task.model || "unknown")
    const kind = String(task.kind || "unknown")

    increment(result.byStatus, decision.toStatus)
    increment(result.byModel, model)
    result.changes.push({
      id: requestId,
      model,
      kind,
      fromStatus: String(task.status || "unknown"),
      toStatus: decision.toStatus,
      previousStage: task.stage || null,
      stage: decision.stage,
      reason: decision.reason,
      updatedAt: task.updated_at || null,
    })

    if (!dryRun) {
      const { error: updateError } = await supabase
        .from("ai_task_runs")
        .update(buildPatch(task as AiTaskRunForReconcile, decision, cutoff))
        .eq("id", requestId)
        .in("status", ["queued", "running"])
        .lt("updated_at", cutoff)

      if (updateError) {
        result.errors.push(`${requestId}: ${updateError.message}`)
        continue
      }
    }

    result.reconciled += 1
  }

  return result
}
