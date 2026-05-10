import { z } from "zod"
import { WORKSHEET_DIAGNOSIS_MAX_IMAGES } from "@/lib/billing-config"

export const WORKSHEET_DIAGNOSIS_SCHEMA_VERSION = "worksheet-diagnosis-v1"

export const WORKSHEET_REPORT_STYLES = [
  "parent",
  "teacher",
  "student",
] as const

const DefaultSubjectSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value
  const trimmed = value.trim()
  return trimmed || "数学"
}, z.string().min(1).max(40).default("数学"))

const DifyImageInputSchema = z.object({
  type: z.literal("image").optional(),
  transfer_method: z.enum(["local_file", "remote_url"]),
  upload_file_id: z.string().min(1).optional(),
  url: z.string().url().optional(),
}).refine((value) => {
  if (value.transfer_method === "local_file") return Boolean(value.upload_file_id)
  return Boolean(value.url)
}, "image must contain upload_file_id or url")

export const WorksheetDiagnosisRequestSchema = z.object({
  images: z.array(DifyImageInputSchema).min(1).max(WORKSHEET_DIAGNOSIS_MAX_IMAGES),
  subject: DefaultSubjectSchema,
  grade: z.string().trim().max(40).optional().default(""),
  reportStyle: z.enum(WORKSHEET_REPORT_STYLES).default("parent"),
  extraContext: z.string().trim().max(1000).optional().default(""),
})

const EvidenceSchema = z.object({
  question: z.string().default(""),
  reason: z.string().default(""),
  quote: z.string().optional().default(""),
})

const TrainingPlanSchema = z.object({
  title: z.string().default(""),
  action: z.string().default(""),
  frequency: z.string().optional().default(""),
})

export const WorksheetDiagnosisSchema = z.object({
  schema_version: z.string().optional().default(WORKSHEET_DIAGNOSIS_SCHEMA_VERSION),
  subject: z.string().default(""),
  grade_hint: z.string().default(""),
  overall_summary: z.string().default(""),
  main_issues: z.array(z.string()).default([]),
  evidence: z.array(EvidenceSchema).default([]),
  solutions: z.array(z.string()).default([]),
  training_plan: z.array(TrainingPlanSchema).default([]),
  parent_message: z.string().default(""),
  cautions: z.array(z.string()).default([]),
})

export type WorksheetDiagnosisRequest = z.infer<typeof WorksheetDiagnosisRequestSchema>
export type WorksheetDiagnosis = z.infer<typeof WorksheetDiagnosisSchema>

function stripMarkdownCodeFence(value: string) {
  const trimmed = value.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1].trim() : trimmed
}

function extractJsonObject(value: string) {
  const withoutFence = stripMarkdownCodeFence(value)
  if (withoutFence.startsWith("{") && withoutFence.endsWith("}")) return withoutFence

  const first = withoutFence.indexOf("{")
  const last = withoutFence.lastIndexOf("}")
  if (first >= 0 && last > first) return withoutFence.slice(first, last + 1)

  return withoutFence
}

function parsePossibleJson(value: unknown): unknown {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(extractJsonObject(value))
  } catch {
    return value
  }
}

function pickFirstOutput(outputs: Record<string, unknown>) {
  const keys = [
    "diagnosis_json",
    "diagnosis",
    "result",
    "output",
    "text",
    "answer",
  ]

  for (const key of keys) {
    if (outputs[key] !== undefined && outputs[key] !== null) return outputs[key]
  }
  return outputs
}

export function normalizeWorksheetImages(images: WorksheetDiagnosisRequest["images"]) {
  return images.map((image) => ({
    type: "image",
    transfer_method: image.transfer_method,
    ...(image.transfer_method === "local_file"
      ? { upload_file_id: image.upload_file_id }
      : { url: image.url }),
  }))
}

export function buildWorksheetDiagnosisInputs(input: WorksheetDiagnosisRequest) {
  return {
    worksheet_images: normalizeWorksheetImages(input.images),
    subject: input.subject,
    grade: input.grade || "",
    report_style: input.reportStyle,
    extra_context: input.extraContext || "",
    output_schema_version: WORKSHEET_DIAGNOSIS_SCHEMA_VERSION,
    output_contract: [
      "Return strict JSON only.",
      "Use keys: schema_version, subject, grade_hint, overall_summary, main_issues, evidence, solutions, training_plan, parent_message, cautions.",
      "Every diagnosis point must be supported by visible worksheet evidence.",
      "Do not add medical or psychological labels.",
    ].join("\n"),
  }
}

export function parseWorksheetDiagnosis(outputs: Record<string, unknown>): WorksheetDiagnosis {
  const parsed = parsePossibleJson(pickFirstOutput(outputs))

  if (typeof parsed === "string") {
    return WorksheetDiagnosisSchema.parse({
      overall_summary: parsed.slice(0, 1200),
      cautions: ["Dify 未返回结构化 JSON，已保留原始诊断文本。"],
    })
  }

  const result = WorksheetDiagnosisSchema.safeParse(parsed)
  if (result.success) return result.data

  return WorksheetDiagnosisSchema.parse({
    overall_summary: "诊断结果格式不完整，请检查 Dify 工作流输出字段。",
    cautions: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).slice(0, 5),
  })
}

export function buildWorksheetReportRenderPrompt(diagnosis: WorksheetDiagnosis, style: WorksheetDiagnosisRequest["reportStyle"]) {
  const styleLabel = {
    parent: "家长沟通版：温和、清晰、可转发",
    teacher: "教师反馈版：证据明确、结构严谨",
    student: "学生自查版：行动清单突出、语气鼓励",
  }[style]

  return [
    "请根据以下学习诊断 JSON，生成一张中文学习诊断报告图。",
    `报告风格：${styleLabel}`,
    "",
    "设计要求：",
    "1. 3:4 竖版信息图，建议输出 1080x1440，适合手机截图和家长群转发。",
    "2. 分区包含：主要问题、卷面证据、解决方案、7天训练计划、家长沟通话术。",
    "3. 中文必须准确可读，不要编造题目、分数或证据。",
    "4. 语气温和专业，不使用智力、人格、心理疾病等标签。",
    "5. 视觉上清晰克制，使用问题/建议/行动三类颜色区分。",
    "",
    "诊断 JSON：",
    JSON.stringify(diagnosis, null, 2),
  ].join("\n")
}
