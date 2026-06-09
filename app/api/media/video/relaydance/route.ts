import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { requireUser } from "@/lib/auth/verified-user"
import { createRequestId, createTaskRun, sanitizeForTrace, updateTaskRun } from "@/lib/ai-task-trace"
import { createRelayDanceVideo, RELAYDANCE_DEFAULT_MODEL } from "@/lib/relaydance-gateway-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

const createVideoSchema = z.object({
  prompt: z.string().trim().min(1, "prompt 不能为空").max(2000, "prompt 不能超过 2000 字符"),
  model: z.string().trim().optional().default(RELAYDANCE_DEFAULT_MODEL),
  seconds: z.union([z.string(), z.number()]).optional().default("5"),
  ratio: z.string().trim().optional().default("16:9"),
  resolution: z.string().trim().optional().default("720p"),
  generate_audio: z.boolean().optional().default(false),
  watermark: z.boolean().nullable().optional(),
  first_frame_url: z.string().trim().url().or(z.literal("")).nullable().optional(),
  firstFrameUrl: z.string().trim().url().or(z.literal("")).nullable().optional(),
  last_frame_url: z.string().trim().url().or(z.literal("")).nullable().optional(),
  lastFrameUrl: z.string().trim().url().or(z.literal("")).nullable().optional(),
})

function publicErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "视频生成服务请求失败")
  if (message.startsWith("RELAYDANCE_GATEWAY_CONFIG_MISSING")) {
    return "视频服务暂时不可用，请稍后重试。"
  }
  if (/config|missing|api[_-]?key|token|secret|authorization|env|environment|未配置|凭据/i.test(message)) {
    return "视频服务暂时不可用，请稍后重试。"
  }
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_SECRET]")
    .slice(0, 500)
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth.response) return auth.response

  const body = await request.json().catch(() => null)
  const parsed = createVideoSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "参数格式错误", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }

  const input = parsed.data
  const requestId = createRequestId("video")
  const firstFrameUrl = input.first_frame_url || input.firstFrameUrl || null
  const lastFrameUrl = input.last_frame_url || input.lastFrameUrl || null
  const baseMetadata = {
    provider: "relaydance",
    source: "relaydance_gateway",
    prompt: input.prompt,
    model: input.model,
    seconds: String(input.seconds),
    ratio: input.ratio,
    resolution: input.resolution,
    generate_audio: input.generate_audio,
    has_first_frame: Boolean(firstFrameUrl),
    has_last_frame: Boolean(lastFrameUrl),
  }
  const taskRun = await createTaskRun({
    userId: auth.user!.id,
    requestId,
    model: input.model,
    kind: "video_generation",
    stage: "视频任务提交中",
    metadata: baseMetadata,
  })

  try {
    const result = await createRelayDanceVideo({
      ...input,
      first_frame_url: firstFrameUrl,
      last_frame_url: lastFrameUrl,
    })
    const payload = result.payload
    const providerTaskId = typeof payload.task_id === "string" ? payload.task_id : ""

    if (!result.ok || !providerTaskId) {
      const errorMessage = result.error || "RelayDance 没有返回任务 ID"
      await updateTaskRun(taskRun.id, {
        status: "failed",
        stage: "视频任务提交失败",
        progress: 100,
        errorMessage,
        errorCode: payload.provider_code || `RELAYDANCE_${result.status}`,
        sanitizedError: sanitizeForTrace(payload) as Record<string, unknown>,
        metadata: {
          ...baseMetadata,
          gateway_status: payload.status || "submit_failed",
          provider_response: sanitizeForTrace(payload.provider_response || payload) as Record<string, unknown>,
        },
      })
      return NextResponse.json({ success: false, error: errorMessage, request_id: taskRun.requestId }, { status: result.status >= 400 ? result.status : 502 })
    }

    await updateTaskRun(taskRun.id, {
      status: "running",
      stage: "视频任务已提交",
      progress: 15,
      upstreamTaskId: providerTaskId,
      metadata: {
        ...baseMetadata,
        gateway_status: payload.status || "submitted",
        provider_task_id: providerTaskId,
        provider_response: sanitizeForTrace(payload.provider_response || payload) as Record<string, unknown>,
        warnings: payload.warnings || [],
      },
    })

    return NextResponse.json({
      success: true,
      task_id: taskRun.requestId,
      request_id: taskRun.requestId,
      status: "running",
      poll_url: `/api/media/tasks/${encodeURIComponent(taskRun.requestId)}`,
      warnings: payload.warnings || [],
    })
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error || "")
    const message = publicErrorMessage(error)
    await updateTaskRun(taskRun.id, {
      status: "failed",
      stage: "视频任务提交失败",
      progress: 100,
      errorMessage: message,
      errorCode: rawMessage.startsWith("RELAYDANCE_GATEWAY_CONFIG_MISSING") ? "RELAYDANCE_GATEWAY_CONFIG_MISSING" : "RELAYDANCE_GATEWAY_ERROR",
      sanitizedError: { message },
      metadata: {
        ...baseMetadata,
        gateway_status: "submit_error",
      },
    })
    return NextResponse.json({ success: false, error: message, request_id: taskRun.requestId }, { status: rawMessage.startsWith("RELAYDANCE_GATEWAY_CONFIG_MISSING") ? 503 : 500 })
  }
}
