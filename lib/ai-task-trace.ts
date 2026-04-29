import { createHash, randomUUID } from "crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "timeout" | "cancelled"

type TaskArtifact = {
  type: "image" | "html" | "ppt" | "pdf" | "file"
  url: string
  name?: string
}

type TaskNodeEvent = {
  event: string
  title?: string
  node_id?: string
  status?: string
  workflow_run_id?: string
  created_at: string
}

type CreateTaskRunInput = {
  userId: string
  sessionId?: string | null
  messageId?: string | null
  model: string
  kind: string
  requestId?: string | null
  traceId?: string | null
  stage?: string
  metadata?: Record<string, unknown>
}

type UpdateTaskRunInput = {
  status?: TaskStatus
  stage?: string
  progress?: number
  conversationId?: string | null
  workflowRunId?: string | null
  upstreamTaskId?: string | null
  currentTool?: string | null
  currentFile?: string | null
  artifacts?: TaskArtifact[]
  errorMessage?: string | null
  errorCode?: string | null
  sanitizedError?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
}

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /sk-[A-Za-z0-9_-]{12,}/gi,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /(?:api[_-]?key|token|secret|authorization)["':=\s]+[A-Za-z0-9._~+/=-]{8,}/gi,
]

let supabaseInstance: SupabaseClient | null = null
let taskTableAvailable: boolean | null = null

function getSupabaseAdmin() {
  if (supabaseInstance) return supabaseInstance
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  supabaseInstance = createClient(url, key)
  return supabaseInstance
}

function clampProgress(value: number | undefined) {
  if (!Number.isFinite(value)) return undefined
  return Math.min(100, Math.max(0, Math.round(value as number)))
}

export function createRequestId(prefix = "req") {
  return `${prefix}_${randomUUID()}`
}

export function createTraceId(requestId: string) {
  return createHash("sha256").update(`${requestId}:${Date.now()}:${randomUUID()}`).digest("hex").slice(0, 24)
}

export function sanitizeForTrace(value: unknown, maxLength = 1200): unknown {
  if (value == null) return value
  if (typeof value === "string") {
    let text = value
    for (const pattern of SECRET_PATTERNS) {
      text = text.replace(pattern, "[redacted]")
    }
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  }
  if (typeof value === "number" || typeof value === "boolean") return value
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeForTrace(item, maxLength))
  if (typeof value === "object") {
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      if (/authorization|token|secret|key|password/i.test(key)) {
        output[key] = "[redacted]"
      } else {
        output[key] = sanitizeForTrace(item, maxLength)
      }
    }
    return output
  }
  return String(value)
}

export function extractArtifactsFromText(text: string): TaskArtifact[] {
  const artifacts = new Map<string, TaskArtifact>()
  const urlPattern = /https?:\/\/[^\s)"'<>`]+|\/api\/openclaw-media-sign\/[^\s)"'<>`]+|\/slides\/[^\s)"'<>`]+/g
  for (const match of text.matchAll(urlPattern)) {
    const rawUrl = match[0].replace(/[.,;，。；]+$/, "")
    const lower = rawUrl.toLowerCase()
    const name = decodeURIComponent(rawUrl.split("/").pop()?.split(/[?#]/, 1)[0] || "file")
    const type: TaskArtifact["type"] =
      /\.(png|jpe?g|webp|gif|avif)(?:[?#]|$)/i.test(lower) ? "image" :
      /\.html?(?:[?#]|$)/i.test(lower) ? "html" :
      /\.pptx?(?:[?#]|$)/i.test(lower) ? "ppt" :
      /\.pdf(?:[?#]|$)/i.test(lower) ? "pdf" :
      "file"
    artifacts.set(rawUrl, { type, url: rawUrl, name })
  }
  return Array.from(artifacts.values()).slice(0, 50)
}

export function extractArtifactsFromUnknown(value: unknown): TaskArtifact[] {
  const text = typeof value === "string" ? value : JSON.stringify(sanitizeForTrace(value) || "")
  return extractArtifactsFromText(text)
}

export async function createTaskRun(input: CreateTaskRunInput) {
  const supabase = getSupabaseAdmin()
  const requestId = input.requestId || createRequestId(input.kind || "task")
  const traceId = input.traceId || createTraceId(requestId)
  const id = requestId

  if (!supabase || taskTableAvailable === false) {
    return { id, requestId, traceId, persisted: false }
  }

  const { error } = await supabase.from("ai_task_runs").upsert({
    id,
    user_id: input.userId,
    session_id: input.sessionId || null,
    message_id: input.messageId || null,
    model: input.model,
    kind: input.kind,
    status: "queued",
    stage: input.stage || "queued",
    progress: 0,
    request_id: requestId,
    trace_id: traceId,
    metadata: sanitizeForTrace(input.metadata || {}) as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" })

  if (error) {
    if (error.code === "42P01") taskTableAvailable = false
    console.warn("[AI Task Trace] create skipped:", error.message)
    return { id, requestId, traceId, persisted: false }
  }

  taskTableAvailable = true
  return { id, requestId, traceId, persisted: true }
}

export async function updateTaskRun(id: string, input: UpdateTaskRunInput) {
  const supabase = getSupabaseAdmin()
  if (!supabase || taskTableAvailable === false) return

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    updated_at: now,
  }
  if (input.status) {
    patch.status = input.status
    if (input.status === "succeeded" || input.status === "failed" || input.status === "timeout" || input.status === "cancelled") {
      patch.completed_at = now
    }
  }
  if (input.stage !== undefined) patch.stage = input.stage
  if (input.progress !== undefined) patch.progress = clampProgress(input.progress)
  if (input.conversationId !== undefined) patch.conversation_id = input.conversationId
  if (input.workflowRunId !== undefined) patch.workflow_run_id = input.workflowRunId
  if (input.upstreamTaskId !== undefined) patch.upstream_task_id = input.upstreamTaskId
  if (input.currentTool !== undefined) patch.current_tool = input.currentTool
  if (input.currentFile !== undefined) patch.current_file = input.currentFile
  if (input.errorMessage !== undefined) patch.error_message = sanitizeForTrace(input.errorMessage, 1000)
  if (input.errorCode !== undefined) patch.error_code = input.errorCode
  if (input.sanitizedError !== undefined) patch.sanitized_error = sanitizeForTrace(input.sanitizedError)
  if (input.metadata !== undefined) patch.metadata = sanitizeForTrace(input.metadata)
  if (input.artifacts !== undefined) patch.artifacts = sanitizeForTrace(input.artifacts)

  const { error } = await supabase.from("ai_task_runs").update(patch).eq("id", id)
  if (error) {
    if (error.code === "42P01") taskTableAvailable = false
    console.warn("[AI Task Trace] update skipped:", error.message)
  }
}

export async function appendTaskNodeEvent(id: string, event: Omit<TaskNodeEvent, "created_at">) {
  const supabase = getSupabaseAdmin()
  if (!supabase || taskTableAvailable === false) return

  const { data, error: readError } = await supabase
    .from("ai_task_runs")
    .select("node_events")
    .eq("id", id)
    .single()

  if (readError) {
    if (readError.code === "42P01") taskTableAvailable = false
    return
  }

  const events = Array.isArray(data?.node_events) ? data.node_events : []
  const nextEvents = [
    ...events.slice(-79),
    sanitizeForTrace({ ...event, created_at: new Date().toISOString() }),
  ]

  await updateTaskRun(id, {
    status: "running",
    stage: event.title || event.event,
    workflowRunId: event.workflow_run_id || null,
    currentTool: event.title || null,
    progress: event.event === "node_finished" ? Math.min(90, 20 + nextEvents.length * 8) : Math.min(85, 10 + nextEvents.length * 6),
    metadata: { last_event: event.event },
  })

  const { error } = await supabase
    .from("ai_task_runs")
    .update({ node_events: nextEvents, updated_at: new Date().toISOString() })
    .eq("id", id)

  if (error) console.warn("[AI Task Trace] append node skipped:", error.message)
}

export async function getTaskRunsForUser(params: {
  userId: string
  requestId?: string | null
  sessionId?: string | null
  limit?: number
}) {
  const supabase = getSupabaseAdmin()
  if (!supabase || taskTableAvailable === false) return []

  let query = supabase
    .from("ai_task_runs")
    .select("id,user_id,session_id,message_id,model,kind,status,stage,progress,request_id,trace_id,conversation_id,workflow_run_id,upstream_task_id,current_tool,current_file,node_events,artifacts,error_message,error_code,metadata,created_at,updated_at,completed_at")
    .eq("user_id", params.userId)
    .order("updated_at", { ascending: false })
    .limit(params.limit || 10)

  if (params.requestId) query = query.eq("request_id", params.requestId)
  if (params.sessionId) query = query.eq("session_id", params.sessionId)

  const { data, error } = await query
  if (error) {
    if (error.code === "42P01") taskTableAvailable = false
    console.warn("[AI Task Trace] query skipped:", error.message)
    return []
  }
  taskTableAvailable = true
  return data || []
}
