import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { createSunoDifyClient } from "@/lib/suno-dify-client"
import {
  SUNO_MAX_UPLOAD_BYTES,
  buildDifyInputs,
  parseDifyResult,
  sunoRunRequestSchema,
  validateOperationInput,
  type SunoFormValues,
} from "@/lib/suno-workflow-schema"

export const dynamic = "force-dynamic"

const FILE_OPERATIONS = new Set(["upload_s3", "upload_full", "upload_full_and_create"])

function sanitizeErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "服务暂时不可用")
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_SECRET]")
    .replace(/gateway_api_key["':\s]+[^"',\s}]+/gi, "gateway_api_key:[REDACTED]")
    .slice(0, 500)
}

function formDataToValues(form: FormData): SunoFormValues {
  const values: SunoFormValues = {}
  for (const [key, value] of form.entries()) {
    if (key === "audio_file" && value instanceof File) {
      values.audio_file = value
      values.upload_filename = values.upload_filename || value.name
      continue
    }
    values[key as keyof SunoFormValues] = String(value)
  }
  return values
}

async function parseRequest(request: NextRequest): Promise<{ values: SunoFormValues; file?: File }> {
  const contentType = request.headers.get("content-type") || ""
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData()
    const values = formDataToValues(form)
    const file = values.audio_file instanceof File ? values.audio_file : undefined
    return { values, file }
  }

  const body = await request.json().catch(() => ({}))
  return { values: body as SunoFormValues }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request)
    if (auth.response) return auth.response

    const { values, file } = await parseRequest(request)
    const operation = String(values.operation || "")
    const parsedBody = sunoRunRequestSchema.safeParse({ ...values, audio_file: undefined })

    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, error: "参数格式错误", details: parsedBody.error.flatten().fieldErrors },
        { status: 422 },
      )
    }

    if (FILE_OPERATIONS.has(operation)) {
      if (!file) {
        return NextResponse.json({ success: false, error: "请上传音频文件" }, { status: 422 })
      }
      if (file.size > SUNO_MAX_UPLOAD_BYTES) {
        return NextResponse.json({ success: false, error: "音频文件不能超过 200MB" }, { status: 413 })
      }
    }

    const validation = validateOperationInput({ ...values, audio_file: file || values.audio_file })
    if (!validation.ok) {
      return NextResponse.json({ success: false, error: "表单校验失败", details: validation.errors }, { status: 422 })
    }

    const client = createSunoDifyClient()
    const user = process.env.DIFY_WORKFLOW_USER || auth.user?.id || "website-user"
    const inputs = buildDifyInputs({ ...values, audio_file: file || values.audio_file })

    if (file) {
      const uploaded = await client.uploadFile({ file, user })
      inputs.audio_file = [uploaded]
      inputs.upload_filename = inputs.upload_filename || file.name
    }

    const result = await client.runWorkflow({ inputs, user })
    const normalized = parseDifyResult(result)

    return NextResponse.json({
      ...normalized,
      success: result.success,
      http_status: result.http_status,
      response_json: result.response_json,
      error: result.error || normalized.error,
    }, { status: result.http_status && result.http_status >= 400 ? result.http_status : 200 })
  } catch (error) {
    const message = sanitizeErrorMessage(error)
    const status = message.startsWith("SUNO_WORKFLOW_CONFIG_MISSING") ? 503 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
