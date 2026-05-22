import {
  type TaskArtifact,
  type TaskRunRecord,
  normalizeMediaTask,
  sanitizeForTrace,
  updateTaskRun,
} from "@/lib/ai-task-trace"
import { getRelayDanceVideoTask, type RelayDanceGatewayResponse } from "@/lib/relaydance-gateway-client"

const RELAYDANCE_COMPLETED_STATUSES = new Set(["completed", "succeeded", "success", "done"])
const RELAYDANCE_FAILED_STATUSES = new Set(["failed", "failure", "error"])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function isActiveTask(task: TaskRunRecord) {
  return task.status === "queued" || task.status === "running"
}

function isRelayDanceTask(task: TaskRunRecord) {
  const metadata = asRecord(task.metadata)
  return task.kind === "video_generation" && metadata.provider === "relaydance" && Boolean(task.upstream_task_id)
}

function videoUrlFromPayload(payload: RelayDanceGatewayResponse) {
  if (asString(payload.video_url)) return asString(payload.video_url)
  const firstVideoUrl = Array.isArray(payload.video_urls) ? payload.video_urls.find((url) => asString(url)) : undefined
  if (firstVideoUrl) return firstVideoUrl
  const provider = asRecord(payload.provider_response)
  const metadata = asRecord(provider.metadata)
  return asString(metadata.url) || asString(provider.url)
}

function statusFromPayload(payload: RelayDanceGatewayResponse) {
  const status = asString(payload.status) || asString(asRecord(payload.provider_response).status)
  return (status || "").toLowerCase()
}

function errorMessageFromPayload(payload: RelayDanceGatewayResponse) {
  if (asString(payload.message)) return asString(payload.message)
  if (asString(payload.error)) return asString(payload.error)
  const error = asRecord(payload.error)
  return asString(error.message) || asString(error.code) || "视频生成失败"
}

function buildMergedTask(task: TaskRunRecord, patch: Partial<TaskRunRecord>): TaskRunRecord {
  return {
    ...task,
    ...patch,
    metadata: {
      ...asRecord(task.metadata),
      ...asRecord(patch.metadata),
    },
  }
}

function buildRelayDanceArtifacts(videoUrl: string | undefined, expiresAt: string | undefined): TaskArtifact[] {
  if (!videoUrl) return []
  return [{
    type: "video",
    url: videoUrl,
    download_url: videoUrl,
    expires_at: expiresAt,
  }]
}

export async function refreshMediaTask(task: TaskRunRecord): Promise<TaskRunRecord> {
  if (!isActiveTask(task) || !isRelayDanceTask(task)) return task

  const result = await getRelayDanceVideoTask(task.upstream_task_id!)
  const payload = result.payload || {}
  const providerStatus = statusFromPayload(payload) || (result.ok ? "running" : "error")
  const providerResponse = sanitizeForTrace(payload.provider_response || payload) as Record<string, unknown>
  const existingMetadata = asRecord(task.metadata)
  const progress = asNumber(payload.progress)
  const videoUrl = videoUrlFromPayload(payload)
  const expiresAt = asString(existingMetadata.expires_at)
  const baseMetadata = {
    ...existingMetadata,
    provider: "relaydance",
    gateway_status: providerStatus,
    provider_status: providerStatus,
    provider_response: providerResponse,
    ...(videoUrl ? { temporary_video_url: videoUrl, video_url: videoUrl } : {}),
  }

  if (!result.ok || RELAYDANCE_FAILED_STATUSES.has(providerStatus)) {
    const errorMessage = result.error || errorMessageFromPayload(payload) || "视频生成失败"
    await updateTaskRun(task.id, {
      status: "failed",
      stage: "视频生成失败",
      progress: 100,
      errorMessage,
      errorCode: payload.provider_code || `RELAYDANCE_${result.status}`,
      sanitizedError: providerResponse,
      metadata: baseMetadata,
    })
    return buildMergedTask(task, {
      status: "failed",
      stage: "视频生成失败",
      progress: 100,
      error_message: errorMessage,
      error_code: payload.provider_code || `RELAYDANCE_${result.status}`,
      metadata: baseMetadata,
      completed_at: new Date().toISOString(),
    })
  }

  if (RELAYDANCE_COMPLETED_STATUSES.has(providerStatus) || videoUrl) {
    const artifacts = buildRelayDanceArtifacts(videoUrl, expiresAt)
    await updateTaskRun(task.id, {
      status: "succeeded",
      stage: "视频生成完成",
      progress: 100,
      artifacts,
      metadata: baseMetadata,
    })
    return buildMergedTask(task, {
      status: "succeeded",
      stage: "视频生成完成",
      progress: 100,
      artifacts,
      metadata: baseMetadata,
      completed_at: new Date().toISOString(),
    })
  }

  const nextProgress = progress === undefined ? Math.max(Number(task.progress || 15), 20) : Math.min(99, Math.max(5, progress))
  await updateTaskRun(task.id, {
    status: "running",
    stage: "视频生成中",
    progress: nextProgress,
    metadata: baseMetadata,
  })
  return buildMergedTask(task, {
    status: "running",
    stage: "视频生成中",
    progress: nextProgress,
    metadata: baseMetadata,
  })
}

export function normalizeRefreshedMediaTask(task: TaskRunRecord) {
  return normalizeMediaTask(task)
}
