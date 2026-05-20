import { z } from "zod"

export const SUNO_OPERATIONS = [
  "health",
  "music_inspiration",
  "music_custom",
  "music_extend",
  "music_persona",
  "music_upload_extend",
  "music_cover",
  "music_stitch_submit",
  "lyrics",
  "concat",
  "upload_authorize",
  "upload_s3",
  "upload_finish",
  "upload_status",
  "initialize_clip",
  "upload_full",
  "upload_full_and_create",
  "generate_inspiration",
  "generate_custom",
  "generate_instrumental",
  "tasks_batch",
  "fetch_task",
  "wav",
  "timing",
  "feed",
  "callbacks_recent",
  "raw",
] as const

export type SunoOperation = (typeof SUNO_OPERATIONS)[number]

export const SUNO_COST_OPERATIONS = new Set<SunoOperation>([
  "music_inspiration",
  "music_custom",
  "music_extend",
  "music_persona",
  "music_upload_extend",
  "music_cover",
  "upload_full_and_create",
  "generate_inspiration",
  "generate_custom",
  "generate_instrumental",
])

export const SUNO_MODEL_OPTIONS = [
  "chirp-v5",
  "chirp-fenix",
  "chirp-v4",
  "chirp-v3-5",
  "chirp-v3-0",
  "chirp-auk",
  "chirp-v3-5-upload",
  "chirp-v3-5-tau",
  "chirp-v4-tau",
  "custom",
] as const

export const SUNO_AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "aac", "ogg", "flac"] as const
export const SUNO_MAX_UPLOAD_BYTES = 200 * 1024 * 1024

export type DifyFileInput = {
  type: "audio"
  transfer_method: "local_file"
  upload_file_id: string
}

export type DifyWorkflowInputs = {
  gateway_base_url: string
  gateway_api_key: string
  operation: SunoOperation | string
  prompt: string
  gpt_description_prompt: string
  title: string
  tags: string
  negative_tags: string
  mv: string
  make_instrumental: string
  generation_type: string
  vocal_gender: string
  continue_clip_id: string
  continue_at: string
  persona_id: string
  artist_clip_id: string
  cover_clip_id: string
  clip_id: string
  task_id: string
  upload_id: string
  timing_id: string
  ids: string
  extension: string
  upload_type: string
  upload_filename: string
  wait_complete: string
  poll_interval_seconds: string
  poll_timeout_seconds: string
  audio_file: string | DifyFileInput | DifyFileInput[]
  is_infill: string
  infill_start_s: string
  infill_end_s: string
  continued_aligned_prompt: string
  notify_hook: string
  s3_url: string
  s3_fields_json: string
  raw_method: string
  raw_path: string
  raw_body_json: string
  extra_json: string
}

export type SunoFormValues = Partial<Record<keyof DifyWorkflowInputs, unknown>> & {
  operation?: SunoOperation | string
  custom_mv?: string
  audio_file?: unknown
}

export type SunoValidationResult = {
  ok: boolean
  errors: Record<string, string>
}

const JSON_OBJECT_FALLBACK = "{}"

export function normalizeBooleanString(value: unknown, fallback = "false") {
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "true") return "true"
    if (normalized === "false") return "false"
  }
  return fallback
}

export function normalizeJsonString(value: unknown, fallback = JSON_OBJECT_FALLBACK) {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) return fallback
  try {
    JSON.parse(text)
    return text
  } catch {
    return fallback
  }
}

export function isValidJsonString(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

export function toStringValue(value: unknown, fallback = "") {
  if (value === undefined || value === null) return fallback
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : fallback
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value)
}

export function normalizeIds(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join("\n")
  const text = toStringValue(value).trim()
  if (!text) return ""
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean).join("\n")
    } catch {
      return text
    }
  }
  return text
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n")
}

export function inferExtensionFromFilename(filename: string | undefined, fallback = "mp3") {
  const ext = filename?.split(".").pop()?.toLowerCase() || ""
  return SUNO_AUDIO_EXTENSIONS.includes(ext as (typeof SUNO_AUDIO_EXTENSIONS)[number]) ? ext : fallback
}

export function buildDifyInputs(formValues: SunoFormValues): DifyWorkflowInputs {
  const mv = toStringValue(formValues.mv || "chirp-v5")
  const resolvedMv = mv === "custom" ? toStringValue(formValues.custom_mv) : mv
  const filename = toStringValue(formValues.upload_filename)
  const audioFile = formValues.audio_file as { name?: string } | undefined

  return {
    gateway_base_url: "__SERVER_INJECT__",
    gateway_api_key: "__SERVER_INJECT__",
    operation: toStringValue(formValues.operation || "music_custom") as SunoOperation,
    prompt: toStringValue(formValues.prompt),
    gpt_description_prompt: toStringValue(formValues.gpt_description_prompt),
    title: toStringValue(formValues.title),
    tags: toStringValue(formValues.tags),
    negative_tags: toStringValue(formValues.negative_tags),
    mv: resolvedMv || "chirp-v5",
    make_instrumental: normalizeBooleanString(formValues.make_instrumental, "false"),
    generation_type: toStringValue(formValues.generation_type, "TEXT") || "TEXT",
    vocal_gender: toStringValue(formValues.vocal_gender),
    continue_clip_id: toStringValue(formValues.continue_clip_id),
    continue_at: toStringValue(formValues.continue_at),
    persona_id: toStringValue(formValues.persona_id),
    artist_clip_id: toStringValue(formValues.artist_clip_id),
    cover_clip_id: toStringValue(formValues.cover_clip_id),
    clip_id: toStringValue(formValues.clip_id),
    task_id: toStringValue(formValues.task_id),
    upload_id: toStringValue(formValues.upload_id),
    timing_id: toStringValue(formValues.timing_id),
    ids: normalizeIds(formValues.ids),
    extension: toStringValue(formValues.extension) || inferExtensionFromFilename(audioFile?.name || filename),
    upload_type: toStringValue(formValues.upload_type, "file_upload") || "file_upload",
    upload_filename: filename || audioFile?.name || "",
    wait_complete: normalizeBooleanString(formValues.wait_complete, "true"),
    poll_interval_seconds: toStringValue(formValues.poll_interval_seconds, "3") || "3",
    poll_timeout_seconds: toStringValue(formValues.poll_timeout_seconds, "180") || "180",
    audio_file: "",
    is_infill: normalizeBooleanString(formValues.is_infill, "false"),
    infill_start_s: toStringValue(formValues.infill_start_s),
    infill_end_s: toStringValue(formValues.infill_end_s),
    continued_aligned_prompt: toStringValue(formValues.continued_aligned_prompt),
    notify_hook: toStringValue(formValues.notify_hook),
    s3_url: toStringValue(formValues.s3_url),
    s3_fields_json: normalizeJsonString(formValues.s3_fields_json),
    raw_method: toStringValue(formValues.raw_method, "POST") || "POST",
    raw_path: toStringValue(formValues.raw_path, "/suno/submit/music") || "/suno/submit/music",
    raw_body_json: normalizeJsonString(formValues.raw_body_json),
    extra_json: normalizeJsonString(formValues.extra_json),
  }
}

function isBlank(value: unknown) {
  return !toStringValue(value).trim()
}

function isNumericString(value: unknown) {
  const text = toStringValue(value).trim()
  return text !== "" && Number.isFinite(Number(text))
}

function hasFile(value: unknown) {
  if (!value) return false
  if (typeof File !== "undefined" && value instanceof File) return true
  if (typeof value === "object" && "name" in value) return true
  return false
}

export function validateOperationInput(values: SunoFormValues): SunoValidationResult {
  const operation = toStringValue(values.operation) as SunoOperation
  const errors: Record<string, string> = {}
  const requireField = (field: keyof DifyWorkflowInputs, message = "请填写必填项") => {
    if (isBlank(values[field])) errors[field] = message
  }
  const requireNumber = (field: keyof DifyWorkflowInputs) => {
    if (!isNumericString(values[field])) errors[field] = "请输入有效数字"
  }

  switch (operation) {
    case "music_inspiration":
    case "generate_inspiration":
      requireField("gpt_description_prompt")
      break
    case "music_custom":
    case "generate_custom":
      requireField("prompt")
      requireField("title", "建议填写标题")
      requireField("tags", "建议填写风格标签")
      break
    case "music_extend":
    case "music_upload_extend":
      requireField("continue_clip_id")
      requireNumber("continue_at")
      requireField("prompt")
      break
    case "music_persona":
      requireField("persona_id")
      requireField("artist_clip_id")
      requireField("prompt")
      break
    case "music_cover":
      requireField("cover_clip_id")
      break
    case "music_stitch_submit":
    case "concat":
    case "wav":
      requireField("clip_id")
      break
    case "lyrics":
      if (isBlank(values.prompt) && isBlank(values.gpt_description_prompt)) {
        errors.prompt = "prompt 或灵感描述至少填写一个"
      }
      break
    case "upload_authorize":
      requireField("extension")
      break
    case "upload_s3":
      if (!hasFile(values.audio_file)) errors.audio_file = "请上传音频文件"
      requireField("s3_url")
      if (!isValidJsonString(values.s3_fields_json)) errors.s3_fields_json = "请输入合法 JSON"
      break
    case "upload_finish":
      requireField("upload_id")
      requireField("upload_filename")
      break
    case "upload_status":
    case "initialize_clip":
      requireField("upload_id")
      break
    case "upload_full":
      if (!hasFile(values.audio_file)) errors.audio_file = "请上传音频文件"
      break
    case "upload_full_and_create":
      if (!hasFile(values.audio_file)) errors.audio_file = "请上传音频文件"
      requireField("prompt")
      break
    case "tasks_batch":
      requireField("ids")
      break
    case "fetch_task":
      requireField("task_id")
      break
    case "timing":
    case "feed":
      if (isBlank(values.timing_id) && isBlank(values.clip_id)) {
        errors.timing_id = "timing_id 或 clip_id 至少填写一个"
      }
      break
    case "raw":
      if (!["GET", "POST"].includes(toStringValue(values.raw_method, "POST"))) {
        errors.raw_method = "raw_method 只能是 GET 或 POST"
      }
      if (!toStringValue(values.raw_path).startsWith("/suno/")) {
        errors.raw_path = "raw_path 必须以 /suno/ 开头"
      }
      if (toStringValue(values.raw_path).startsWith("http")) {
        errors.raw_path = "raw_path 禁止填写完整 URL"
      }
      if (!isValidJsonString(toStringValue(values.raw_body_json, "{}"))) errors.raw_body_json = "请输入合法 JSON"
      if (!isValidJsonString(toStringValue(values.extra_json, "{}"))) errors.extra_json = "请输入合法 JSON"
      break
  }

  return { ok: Object.keys(errors).length === 0, errors }
}

export const sunoRunRequestSchema = z.object({
  operation: z.enum(SUNO_OPERATIONS),
  prompt: z.string().optional(),
  gpt_description_prompt: z.string().optional(),
  title: z.string().optional(),
  tags: z.string().optional(),
  negative_tags: z.string().optional(),
  mv: z.string().optional(),
  custom_mv: z.string().optional(),
  make_instrumental: z.union([z.boolean(), z.string()]).optional(),
  generation_type: z.string().optional(),
  vocal_gender: z.string().optional(),
  continue_clip_id: z.string().optional(),
  continue_at: z.union([z.string(), z.number()]).optional(),
  persona_id: z.string().optional(),
  artist_clip_id: z.string().optional(),
  cover_clip_id: z.string().optional(),
  clip_id: z.string().optional(),
  task_id: z.string().optional(),
  upload_id: z.string().optional(),
  timing_id: z.string().optional(),
  ids: z.union([z.string(), z.array(z.string())]).optional(),
  extension: z.string().optional(),
  upload_type: z.string().optional(),
  upload_filename: z.string().optional(),
  wait_complete: z.union([z.boolean(), z.string()]).optional(),
  poll_interval_seconds: z.union([z.string(), z.number()]).optional(),
  poll_timeout_seconds: z.union([z.string(), z.number()]).optional(),
  is_infill: z.union([z.boolean(), z.string()]).optional(),
  infill_start_s: z.union([z.string(), z.number()]).optional(),
  infill_end_s: z.union([z.string(), z.number()]).optional(),
  continued_aligned_prompt: z.string().optional(),
  notify_hook: z.string().optional(),
  s3_url: z.string().optional(),
  s3_fields_json: z.string().optional(),
  raw_method: z.enum(["GET", "POST"]).optional(),
  raw_path: z.string().optional(),
  raw_body_json: z.string().optional(),
  extra_json: z.string().optional(),
})

export type SunoRunRequest = z.infer<typeof sunoRunRequestSchema>

export type SunoWorkflowResult = {
  success: boolean
  http_status?: number
  task_id?: string
  clip_id?: string
  upload_id?: string
  status?: string
  audio_urls?: string[]
  image_urls?: string[]
  video_urls?: string[]
  wav_url?: string
  response_json?: unknown
  error?: unknown
}

export function extractTaskId(value: unknown): string {
  if (!value || typeof value !== "object") return ""
  const record = value as Record<string, unknown>
  return toStringValue(record.task_id || record.taskId || record.id)
}

export function extractClipId(value: unknown): string {
  if (!value || typeof value !== "object") return ""
  const record = value as Record<string, unknown>
  return toStringValue(record.clip_id || record.clipId)
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value
  const text = value.trim()
  if (!text) return ""
  if (!text.startsWith("{") && !text.startsWith("[")) return value
  try {
    return JSON.parse(text)
  } catch {
    return value
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readDifyOutputs(value: unknown): Record<string, unknown> | null {
  const record = readRecord(value)
  const data = readRecord(record.data)
  const dataOutputs = readRecord(data.outputs)
  if (Object.keys(dataOutputs).length > 0) return dataOutputs
  const outputs = readRecord(record.outputs)
  return Object.keys(outputs).length > 0 ? outputs : null
}

function isDifyWorkflowEnvelope(value: unknown) {
  const record = readRecord(value)
  const data = readRecord(record.data)
  return Boolean(record.workflow_run_id || data.workflow_id || data.outputs)
}

function parseBooleanLike(value: unknown, fallback?: boolean): boolean | undefined {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (["true", "1", "yes", "success", "succeeded", "ok"].includes(normalized)) return true
    if (["false", "0", "no", "fail", "failed", "error"].includes(normalized)) return false
  }
  return fallback
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = toStringValue(value).trim()
    if (text) return text
  }
  return ""
}

function asStringArray(value: unknown): string[] {
  const parsed = parseJsonValue(value)
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => toStringValue(item).trim())
      .filter(Boolean)
  }
  const text = toStringValue(parsed).trim()
  return text ? [text] : []
}

export function parseDifyResult(payload: unknown): SunoWorkflowResult {
  const root = readRecord(payload)
  const rootOutputs = readDifyOutputs(root)
  const initialOutputs = rootOutputs || root
  const initialResponseJson = parseJsonValue(initialOutputs.response_json || initialOutputs.provider_response || initialOutputs.data_json)
  const nestedOutputs = readDifyOutputs(initialResponseJson)
  const outputs = nestedOutputs || initialOutputs
  const responseJson = parseJsonValue(outputs.response_json || outputs.provider_response || outputs.data_json || initialResponseJson || payload)
  const provider = readRecord(responseJson)
  const responseIsDifyEnvelope = isDifyWorkflowEnvelope(responseJson)
  const rootIsDifyEnvelope = isDifyWorkflowEnvelope(root)
  const outputSuccess = parseBooleanLike(outputs.success)
  const providerSuccess = parseBooleanLike(provider.success)
  const workflowSuccess = parseBooleanLike(readRecord(root.data).status === "succeeded")
  const success = outputSuccess ?? providerSuccess ?? parseBooleanLike(root.success) ?? workflowSuccess ?? false
  const providerTaskId = responseIsDifyEnvelope ? firstText(readDifyOutputs(responseJson)?.task_id) : extractTaskId(responseJson)
  const rootTaskId = rootIsDifyEnvelope ? "" : toStringValue(root.task_id)
  const providerClipId = responseIsDifyEnvelope ? firstText(readDifyOutputs(responseJson)?.clip_id) : extractClipId(responseJson)

  return {
    success,
    http_status: Number(outputs.http_status || outputs.status_code || provider.status_code || root.status_code || 200),
    task_id: firstText(outputs.task_id, providerTaskId, rootTaskId),
    clip_id: firstText(outputs.clip_id, providerClipId),
    upload_id: firstText(outputs.upload_id, provider.upload_id),
    status: firstText(outputs.status, provider.status),
    audio_urls: asStringArray(outputs.audio_urls).concat(asStringArray(provider.audio_urls)),
    image_urls: asStringArray(outputs.image_urls).concat(asStringArray(provider.image_urls)),
    video_urls: asStringArray(outputs.video_urls).concat(asStringArray(provider.video_urls)),
    wav_url: firstText(outputs.wav_url, provider.wav_url),
    response_json: responseJson,
    error: outputs.error || root.error || provider.error || (!success ? provider.message : null) || null,
  }
}
