import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { requireUser } from "@/lib/auth/verified-user"
import { createRequestId, createTaskRun, normalizeMediaTask, updateTaskRun } from "@/lib/ai-task-trace"
import { chooseProvider, type ProviderModality } from "@/lib/ai-provider-health"
import {
  buildDifyInputs,
  parseDifyResult,
  SUNO_COST_OPERATIONS,
  sunoRunRequestSchema,
  validateOperationInput,
  type SunoOperation,
  type SunoWorkflowResult,
} from "@/lib/suno-workflow-schema"
import { createSunoDifyClient } from "@/lib/suno-dify-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

const createMediaTaskSchema = z.object({
  type: z.enum(["image", "music", "video"]),
  model: z.string().trim().optional(),
  sessionId: z.string().trim().optional(),
  messageId: z.string().trim().optional(),
  request: z.record(z.unknown()).default({}),
})

type MusicSubmitResult =
  | {
      ok: true
      status: number
      normalized: SunoWorkflowResult
      providerTaskId: string
      billableOperation: boolean
      operation: SunoOperation
    }
  | {
      ok: false
      status: number
      error: unknown
      details?: unknown
      normalized?: SunoWorkflowResult
    }

function publicErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "媒体任务提交失败")
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_SECRET]")
    .replace(/(?:api[_-]?key|token|secret|authorization)["':=\s]+[A-Za-z0-9._~+/=-]{8,}/gi, "$1:[REDACTED]")
    .slice(0, 500)
}

async function submitMusicTask(input: {
  userId: string
  values: Record<string, unknown>
}): Promise<MusicSubmitResult> {
  const parsedBody = sunoRunRequestSchema.safeParse(input.values)
  if (!parsedBody.success) {
    return {
      ok: false,
      status: 422,
      error: "参数格式错误",
      details: parsedBody.error.flatten().fieldErrors,
    }
  }

  const validation = validateOperationInput(input.values)
  if (!validation.ok) {
    return {
      ok: false,
      status: 422,
      error: "表单校验失败",
      details: validation.errors,
    }
  }

  const operation = String(input.values.operation || "") as SunoOperation
  const billableOperation = SUNO_COST_OPERATIONS.has(operation)
  const client = createSunoDifyClient()
  const user = process.env.DIFY_WORKFLOW_USER || input.userId || "website-user"
  const result = await client.runWorkflow({ inputs: buildDifyInputs(input.values), user })
  const normalized = parseDifyResult(result.response_json || result)

  if (!result.success || !normalized.success) {
    return {
      ok: false,
      status: result.http_status && result.http_status >= 400 ? result.http_status : 502,
      error: result.error || normalized.error || "音乐任务提交失败",
      normalized,
    }
  }

  return {
    ok: true,
    status: 200,
    normalized,
    providerTaskId: normalized.task_id || normalized.clip_id || normalized.upload_id || "",
    billableOperation,
    operation,
  }
}

function providerResponseMetadata(normalized: SunoWorkflowResult | undefined) {
  if (!normalized) return undefined
  return {
    success: normalized.success,
    http_status: normalized.http_status,
    task_id: normalized.task_id,
    clip_id: normalized.clip_id,
    upload_id: normalized.upload_id,
    status: normalized.status,
    error: normalized.error,
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth.response) return auth.response

  const body = await request.json().catch(() => null)
  const parsed = createMediaTaskSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "参数格式错误", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }

  const input = parsed.data
  const modality = input.type as ProviderModality
  const providerChoice = chooseProvider(modality)
  const requestId = createRequestId(input.type)
  const kind = `${input.type}_generation`
  const model = input.model || providerChoice.provider
  const metadata = {
    provider: providerChoice.provider,
    provider_score: providerChoice.score,
    provider_choice_reason: providerChoice.reason,
    source: "media_orchestrator",
    media_type: input.type,
  }

  const taskRun = await createTaskRun({
    userId: auth.user!.id,
    sessionId: input.sessionId || null,
    messageId: input.messageId || null,
    requestId,
    model,
    kind,
    stage: "媒体任务已创建",
    metadata,
  })

  if (input.type === "image") {
    await updateTaskRun(taskRun.id, {
      status: "running",
      stage: "图片任务已纳入统一状态中心",
      progress: 5,
      metadata: { ...metadata, gateway_status: "awaiting_image_gateway_adapter" },
    })
    return NextResponse.json({
      success: true,
      task_id: taskRun.requestId,
      request_id: taskRun.requestId,
      trace_id: taskRun.traceId,
      status: "queued",
      poll_url: `/api/media/tasks/${encodeURIComponent(taskRun.requestId)}`,
      task: normalizeMediaTask({
        id: taskRun.id,
        user_id: auth.user!.id,
        kind,
        status: "running",
        progress: 5,
        request_id: taskRun.requestId,
        trace_id: taskRun.traceId,
        metadata,
      }),
    }, { status: 202 })
  }

  if (input.type === "video") {
    await updateTaskRun(taskRun.id, {
      status: "running",
      stage: "视频任务已创建，请使用专用视频提交适配器执行",
      progress: 5,
      metadata: { ...metadata, gateway_status: "awaiting_video_gateway_adapter" },
    })
    return NextResponse.json({
      success: true,
      task_id: taskRun.requestId,
      request_id: taskRun.requestId,
      trace_id: taskRun.traceId,
      status: "queued",
      poll_url: `/api/media/tasks/${encodeURIComponent(taskRun.requestId)}`,
      next_adapter: "/api/media/video/relaydance",
    }, { status: 202 })
  }

  try {
    await updateTaskRun(taskRun.id, {
      status: "running",
      stage: "音乐任务提交中",
      progress: 10,
      metadata: { ...metadata, gateway_status: "submitting" },
    })

    const result = await submitMusicTask({
      userId: auth.user!.id,
      values: input.request,
    })

    if (!result.ok) {
      const errorMessage = publicErrorMessage(result.error)
      await updateTaskRun(taskRun.id, {
        status: "failed",
        stage: "音乐任务提交失败",
        progress: 100,
        errorMessage,
        errorCode: "MUSIC_SUBMIT_FAILED",
        metadata: { ...metadata, gateway_status: "submit_failed", provider_response: providerResponseMetadata(result.normalized) },
      })
      return NextResponse.json({
        success: false,
        error: errorMessage,
        details: result.details,
        request_id: taskRun.requestId,
        poll_url: `/api/media/tasks/${encodeURIComponent(taskRun.requestId)}`,
      }, { status: result.status })
    }

    const normalized = result.normalized
    await updateTaskRun(taskRun.id, {
      status: "running",
      stage: "音乐任务已提交",
      progress: 20,
      upstreamTaskId: result.providerTaskId || null,
      metadata: {
        ...metadata,
        gateway_status: normalized.status || "submitted",
        operation: result.operation,
        billable_operation: result.billableOperation,
        audio_url: normalized.audio_urls?.[0],
        image_url: normalized.image_urls?.[0],
        video_url: normalized.video_urls?.[0],
        wav_url: normalized.wav_url,
      },
    })

    return NextResponse.json({
      success: true,
      task_id: taskRun.requestId,
      request_id: taskRun.requestId,
      trace_id: taskRun.traceId,
      provider_task_id: result.providerTaskId,
      status: "running",
      poll_url: `/api/media/tasks/${encodeURIComponent(taskRun.requestId)}`,
    })
  } catch (error) {
    const message = publicErrorMessage(error)
    await updateTaskRun(taskRun.id, {
      status: "failed",
      stage: "媒体任务提交失败",
      progress: 100,
      errorMessage: message,
      errorCode: "MEDIA_TASK_SUBMIT_ERROR",
      metadata: { ...metadata, gateway_status: "submit_error" },
    })
    return NextResponse.json({ success: false, error: message, request_id: taskRun.requestId }, { status: 500 })
  }
}
