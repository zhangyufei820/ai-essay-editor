import { createClient } from "@supabase/supabase-js"
import { extractArtifactsFromUnknown, sanitizeForTrace } from "@/lib/ai-task-trace"

type RefundStatus = "refunded" | "already_refunded" | "no_charge_found" | "conflict" | "error"

export type ImageTaskRefundResult = {
  status: RefundStatus
  requestId: string
  userId?: string
  refundReferenceId?: string
  amount?: number
  balanceBefore?: number
  balanceAfter?: number
  transactionId?: number | string
  message?: string
}

export type SettleStaleImageTasksResult = {
  scanned: number
  settled: number
  recovered: number
  refunded: number
  failedScanned: number
  failedSettled: number
  results: ImageTaskRefundResult[]
  errors: string[]
}

type GatewayTaskState = {
  ok: boolean
  task?: Record<string, unknown>
  error?: string
}

const IMAGE_TASK_QUERY_TIMEOUT_MS = 15_000

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("缺少 Supabase 配置")
  }
  return createClient(url, key)
}

function refundReferenceIdFor(requestId: string) {
  return `refund:${requestId}`
}

function getGatewayStatus(task: Record<string, unknown>) {
  return typeof task.status === "string" ? task.status : ""
}

function getGatewayElapsedMs(task: Record<string, unknown>) {
  return typeof task.elapsed_ms === "number" ? task.elapsed_ms : 0
}

function getGatewayStatusCode(task: Record<string, unknown>) {
  return typeof task.status_code === "number" ? task.status_code : undefined
}

function getGatewayErrorMessage(task: Record<string, unknown>) {
  if (typeof task.error === "string" && task.error.trim()) return task.error
  const payload = task.error_payload && typeof task.error_payload === "object"
    ? task.error_payload as Record<string, unknown>
    : {}
  return typeof payload.message === "string" && payload.message.trim()
    ? payload.message
    : "图片任务失败"
}

function getGatewayResultPayload(task: Record<string, unknown>) {
  return task.result && typeof task.result === "object" ? task.result as Record<string, unknown> : {}
}

async function readGatewayTask(upstreamTaskId: string): Promise<GatewayTaskState> {
  const gatewayUrl = (process.env.DIFY_IMAGE_GATEWAY_URL || "http://dify-image-gateway:8001").replace(/\/+$/, "")
  const gatewayToken = process.env.DIFY_IMAGE_GATEWAY_TOKEN || ""

  try {
    const response = await fetch(`${gatewayUrl}/api/image/tasks/${encodeURIComponent(upstreamTaskId)}`, {
      signal: AbortSignal.timeout(IMAGE_TASK_QUERY_TIMEOUT_MS),
      headers: gatewayToken
        ? {
            "x-gateway-token": gatewayToken,
            Authorization: `Bearer ${gatewayToken}`,
          }
        : {},
    })
    const task = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = task && typeof task === "object" && typeof (task as Record<string, unknown>).error === "string"
        ? String((task as Record<string, unknown>).error)
        : `图片网关任务查询失败 HTTP ${response.status}`
      return { ok: false, error: message }
    }
    return { ok: true, task: task && typeof task === "object" ? task as Record<string, unknown> : {} }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function insertRefundTransaction(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>
  userId: string
  amount: number
  description: string
  referenceId: string
  balanceBefore: number
  balanceAfter: number
  metadata: Record<string, unknown>
}) {
  const basePayload = {
    user_id: params.userId,
    amount: params.amount,
    type: "refund",
    description: params.description,
    reference_id: params.referenceId,
    balance_before: params.balanceBefore,
    balance_after: params.balanceAfter,
  }
  const payload = {
    ...basePayload,
    billing_metadata: sanitizeForTrace(params.metadata),
  }

  const first = await params.supabase
    .from("credit_transactions")
    .insert(payload)
    .select("id")
    .maybeSingle()

  if (!first.error) return first.data

  const message = String(first.error.message || "")
  const shouldFallback =
    first.error.code === "PGRST204" ||
    first.error.code === "42703" ||
    first.error.code === "23514" ||
    message.includes("billing_metadata") ||
    message.includes("Could not find") ||
    message.includes("violates check constraint")

  if (!shouldFallback) throw first.error

  const fallback = await params.supabase
    .from("credit_transactions")
    .insert({
      ...basePayload,
      type: "purchase",
      description: `${params.description}（退款入账）`,
    })
    .select("id")
    .maybeSingle()

  if (fallback.error) throw fallback.error
  return fallback.data
}

export async function refundImageTaskCredits(params: {
  userId: string
  requestId: string
  reason: string
  errorCode?: string
  statusCode?: number
}): Promise<ImageTaskRefundResult> {
  const supabase = getSupabaseAdmin()
  const refundReferenceId = refundReferenceIdFor(params.requestId)

  const { data: existingRefund, error: existingRefundError } = await supabase
    .from("credit_transactions")
    .select("id,amount,balance_before,balance_after")
    .eq("user_id", params.userId)
    .eq("reference_id", refundReferenceId)
    .maybeSingle()

  if (existingRefundError) {
    return {
      status: "error",
      requestId: params.requestId,
      userId: params.userId,
      refundReferenceId,
      message: existingRefundError.message,
    }
  }

  if (existingRefund) {
    return {
      status: "already_refunded",
      requestId: params.requestId,
      userId: params.userId,
      refundReferenceId,
      amount: Number(existingRefund.amount || 0),
      balanceBefore: Number(existingRefund.balance_before || 0),
      balanceAfter: Number(existingRefund.balance_after || 0),
      transactionId: existingRefund.id,
    }
  }

  const { data: charge, error: chargeError } = await supabase
    .from("credit_transactions")
    .select("id,amount,description,reference_id")
    .eq("user_id", params.userId)
    .eq("reference_id", params.requestId)
    .lt("amount", 0)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (chargeError) {
    return {
      status: "error",
      requestId: params.requestId,
      userId: params.userId,
      refundReferenceId,
      message: chargeError.message,
    }
  }

  if (!charge) {
    return {
      status: "no_charge_found",
      requestId: params.requestId,
      userId: params.userId,
      refundReferenceId,
      message: "未找到该图片任务对应的扣费流水",
    }
  }

  const refundAmount = Math.abs(Number(charge.amount || 0))
  if (!Number.isInteger(refundAmount) || refundAmount <= 0) {
    return {
      status: "error",
      requestId: params.requestId,
      userId: params.userId,
      refundReferenceId,
      message: `扣费金额异常: ${charge.amount}`,
    }
  }

  const { data: currentCredits, error: creditsError } = await supabase
    .from("user_credits")
    .select("credits")
    .eq("user_id", params.userId)
    .maybeSingle()

  if (creditsError || !currentCredits) {
    return {
      status: "error",
      requestId: params.requestId,
      userId: params.userId,
      refundReferenceId,
      amount: refundAmount,
      message: creditsError?.message || "用户积分记录不存在",
    }
  }

  const balanceBefore = Number(currentCredits.credits || 0)
  const balanceAfter = balanceBefore + refundAmount

  const { data: updatedCreditRow, error: updateError } = await supabase
    .from("user_credits")
    .update({
      credits: balanceAfter,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", params.userId)
    .eq("credits", balanceBefore)
    .select("credits")
    .maybeSingle()

  if (updateError) {
    return {
      status: "error",
      requestId: params.requestId,
      userId: params.userId,
      refundReferenceId,
      amount: refundAmount,
      balanceBefore,
      message: updateError.message,
    }
  }

  if (!updatedCreditRow || Number(updatedCreditRow.credits) !== balanceAfter) {
    return {
      status: "conflict",
      requestId: params.requestId,
      userId: params.userId,
      refundReferenceId,
      amount: refundAmount,
      balanceBefore,
      balanceAfter,
      message: "积分余额发生并发变更，本次未退款",
    }
  }

  try {
    const transaction = await insertRefundTransaction({
      supabase,
      userId: params.userId,
      amount: refundAmount,
      description: `图片生成失败自动退回积分：${refundAmount}`,
      referenceId: refundReferenceId,
      balanceBefore,
      balanceAfter,
      metadata: {
        actionType: "refund",
        feature: "image2",
        originalRequestId: params.requestId,
        originalTransactionId: charge.id,
        originalDescription: charge.description,
        refundReason: params.reason,
        errorCode: params.errorCode || null,
        statusCode: params.statusCode || null,
        chargedCredits: refundAmount,
      },
    })

    return {
      status: "refunded",
      requestId: params.requestId,
      userId: params.userId,
      refundReferenceId,
      amount: refundAmount,
      balanceBefore,
      balanceAfter,
      transactionId: transaction?.id,
    }
  } catch (error) {
    return {
      status: "error",
      requestId: params.requestId,
      userId: params.userId,
      refundReferenceId,
      amount: refundAmount,
      balanceBefore,
      balanceAfter,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function settleStaleImageTasks(options: {
  olderThanMs?: number
  limit?: number
  dryRun?: boolean
} = {}): Promise<SettleStaleImageTasksResult> {
  const supabase = getSupabaseAdmin()
  const olderThanMs = options.olderThanMs ?? 15 * 60 * 1000
  const limit = Math.min(200, Math.max(1, Math.round(options.limit ?? 50)))
  const cutoff = new Date(Date.now() - olderThanMs).toISOString()
  const result: SettleStaleImageTasksResult = {
    scanned: 0,
    settled: 0,
    recovered: 0,
    refunded: 0,
    failedScanned: 0,
    failedSettled: 0,
    results: [],
    errors: [],
  }

  const { data: staleTasks, error } = await supabase
    .from("ai_task_runs")
    .select("id,user_id,status,stage,metadata,created_at,updated_at,upstream_task_id")
    .eq("model", "gpt-image-2")
    .in("status", ["queued", "running"])
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(limit)

  if (error) {
    result.errors.push(error.message)
    return result
  }

  result.scanned = staleTasks?.length || 0

  for (const task of staleTasks || []) {
    const requestId = String(task.id || "")
    const userId = String(task.user_id || "")
    if (!requestId || !userId) continue
    const metadata = task.metadata && typeof task.metadata === "object" ? task.metadata : {}
    const upstreamTaskId = typeof task.upstream_task_id === "string" ? task.upstream_task_id : ""

    if (upstreamTaskId) {
      const gatewayState = await readGatewayTask(upstreamTaskId)
      if (!gatewayState.ok) {
        result.errors.push(`${requestId}: ${gatewayState.error || "图片网关任务查询失败"}`)
        continue
      }

      const gatewayTask = gatewayState.task || {}
      const gatewayStatus = getGatewayStatus(gatewayTask)
      const elapsedMs = getGatewayElapsedMs(gatewayTask)

      if (gatewayStatus === "succeeded") {
        const gatewayResult = getGatewayResultPayload(gatewayTask)
        if (!options.dryRun) {
          const { error: updateError } = await supabase
            .from("ai_task_runs")
            .update({
              status: "succeeded",
              stage: "图片生成完成",
              progress: 100,
              error_message: null,
              error_code: null,
              artifacts: sanitizeForTrace(extractArtifactsFromUnknown(gatewayResult)),
              metadata: {
                ...metadata,
                elapsed_ms: elapsedMs,
                gateway_status: gatewayStatus,
                recovered_from_stale: true,
                recovered_at: new Date().toISOString(),
              },
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", requestId)
            .in("status", ["queued", "running"])

          if (updateError) {
            result.errors.push(`${requestId}: ${updateError.message}`)
            continue
          }
        }

        result.settled += 1
        result.recovered += 1
        continue
      }

      if (gatewayStatus === "failed") {
        const errorMessage = getGatewayErrorMessage(gatewayTask)
        const statusCode = getGatewayStatusCode(gatewayTask)
        const refund = options.dryRun
          ? {
              status: "no_charge_found" as const,
              requestId,
              userId,
              message: "dry run",
            }
          : await refundImageTaskCredits({
              userId,
              requestId,
              reason: errorMessage,
              errorCode: "IMAGE_TASK_FAILED",
              statusCode,
            })

        if (!options.dryRun) {
          const { error: updateError } = await supabase
            .from("ai_task_runs")
            .update({
              status: "failed",
              stage: "图片生成失败",
              progress: 100,
              error_message: errorMessage,
              error_code: "IMAGE_TASK_FAILED",
              sanitized_error: sanitizeForTrace(gatewayTask),
              metadata: {
                ...metadata,
                elapsed_ms: elapsedMs,
                status_code: statusCode || null,
                gateway_status: gatewayStatus,
                refund_status: refund.status,
                refund_amount: refund.amount || 0,
                refund_reference_id: refund.refundReferenceId || null,
              },
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", requestId)
            .in("status", ["queued", "running"])

          if (updateError) {
            result.errors.push(`${requestId}: ${updateError.message}`)
            continue
          }
        }

        result.settled += 1
        if (refund.status === "refunded" || refund.status === "already_refunded") {
          result.refunded += 1
        }
        result.results.push(refund)
        continue
      }
    }

    if (!options.dryRun) {
      const { error: updateError } = await supabase
        .from("ai_task_runs")
        .update({
          status: "timeout",
          stage: "图片任务超时，已自动结束",
          progress: 100,
          error_message: "图片任务长时间未完成，系统已自动结束并尝试退回积分",
          error_code: "IMAGE_TASK_STALE_TIMEOUT",
          metadata: {
            ...metadata,
            stale_timeout_at: new Date().toISOString(),
            stale_cutoff: cutoff,
            gateway_status: upstreamTaskId ? "stale_running" : "missing_upstream_task_id",
          },
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .in("status", ["queued", "running"])

      if (updateError) {
        result.errors.push(`${requestId}: ${updateError.message}`)
        continue
      }
    }

    result.settled += 1
    const refund = options.dryRun
      ? {
          status: "no_charge_found" as const,
          requestId,
          userId,
          message: "dry run",
        }
      : await refundImageTaskCredits({
          userId,
          requestId,
          reason: "图片任务超时自动结束",
          errorCode: "IMAGE_TASK_STALE_TIMEOUT",
        })

    if (refund.status === "refunded" || refund.status === "already_refunded") {
      result.refunded += 1
    }
    result.results.push(refund)
  }

  const remainingLimit = Math.max(0, limit - result.scanned)
  if (remainingLimit === 0) return result

  const { data: failedTasks, error: failedError } = await supabase
    .from("ai_task_runs")
    .select("id,user_id,error_message,error_code,metadata,created_at,updated_at")
    .eq("model", "gpt-image-2")
    .eq("status", "failed")
    .in("error_code", ["IMAGE_TASK_FAILED", "IMAGE_TASK_NOT_FOUND", "IMAGE_TASK_POLL_TIMEOUT"])
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(remainingLimit)

  if (failedError) {
    result.errors.push(failedError.message)
    return result
  }

  result.failedScanned = failedTasks?.length || 0

  for (const task of failedTasks || []) {
    const metadata = task.metadata && typeof task.metadata === "object"
      ? task.metadata as Record<string, unknown>
      : {}
    if (typeof metadata.refund_status === "string") continue

    const requestId = String(task.id || "")
    const userId = String(task.user_id || "")
    if (!requestId || !userId) continue

    const refund = options.dryRun
      ? {
          status: "no_charge_found" as const,
          requestId,
          userId,
          message: "dry run",
        }
      : await refundImageTaskCredits({
          userId,
          requestId,
          reason: String(task.error_message || "图片生成失败"),
          errorCode: String(task.error_code || "IMAGE_TASK_FAILED"),
          statusCode: typeof metadata.status_code === "number" ? metadata.status_code : undefined,
        })

    result.failedSettled += 1
    if (refund.status === "refunded" || refund.status === "already_refunded") {
      result.refunded += 1
    }
    result.results.push(refund)

    if (!options.dryRun) {
      const { error: updateError } = await supabase
        .from("ai_task_runs")
        .update({
          metadata: {
            ...metadata,
            refund_status: refund.status,
            refund_amount: refund.amount || 0,
            refund_reference_id: refund.refundReferenceId || null,
            refund_checked_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)

      if (updateError) {
        result.errors.push(`${requestId}: ${updateError.message}`)
      }
    }
  }

  return result
}
