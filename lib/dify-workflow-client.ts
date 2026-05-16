import { internalDifyFetch } from "@/lib/internal-dify-fetch"

export type DifyWorkflowRunOptions = {
  apiKey: string
  inputs: Record<string, unknown>
  user: string
  responseMode?: "blocking" | "streaming"
  timeoutMs?: number
}

export type DifyWorkflowRunResult = {
  taskId?: string
  workflowRunId?: string
  status?: string
  outputs: Record<string, unknown>
  raw: Record<string, unknown>
}

const DIFY_BASE_URL = (process.env.DIFY_INTERNAL_URL
  || process.env.DIFY_BASE_URL
  || "https://api.dify.ai/v1").replace(/\/+$/, "")

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

export function extractDifyWorkflowOutputs(payload: unknown): Record<string, unknown> {
  const record = asRecord(payload)
  const data = asRecord(record.data)

  return {
    ...asRecord(record.outputs),
    ...asRecord(data.outputs),
  }
}

export function extractDifyWorkflowStatus(payload: unknown): string | undefined {
  const record = asRecord(payload)
  const data = asRecord(record.data)
  return readString(data.status) || readString(record.status)
}

export function extractDifyWorkflowRunId(payload: unknown): string | undefined {
  const record = asRecord(payload)
  const data = asRecord(record.data)
  return readString(record.workflow_run_id) || readString(data.workflow_run_id) || readString(data.id)
}

export function extractDifyWorkflowTaskId(payload: unknown): string | undefined {
  const record = asRecord(payload)
  return readString(record.task_id)
}

export async function runDifyWorkflow({
  apiKey,
  inputs,
  user,
  responseMode = "blocking",
  timeoutMs = 120_000,
}: DifyWorkflowRunOptions): Promise<DifyWorkflowRunResult> {
  if (!apiKey) {
    throw new Error("DIFY_WORKFLOW_API_KEY_MISSING")
  }

  const timeout = createTimeoutSignal(timeoutMs)
  try {
    const response = await internalDifyFetch(`${DIFY_BASE_URL}/workflows/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        inputs,
        response_mode: responseMode,
        user,
      }),
      signal: timeout.signal,
    })

    const text = await response.text()
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(text) as Record<string, unknown>
    } catch {
      payload = { error: text.slice(0, 500) }
    }

    if (!response.ok) {
      const message = readString(payload.message)
        || readString(payload.error)
        || readString(asRecord(payload.data).error)
        || `Dify workflow failed: ${response.status}`
      throw new Error(message)
    }

    return {
      taskId: extractDifyWorkflowTaskId(payload),
      workflowRunId: extractDifyWorkflowRunId(payload),
      status: extractDifyWorkflowStatus(payload),
      outputs: extractDifyWorkflowOutputs(payload),
      raw: payload,
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("DIFY_WORKFLOW_TIMEOUT")
    }
    throw error
  } finally {
    timeout.clear()
  }
}
