import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { getUserEntitlementSummary } from "@/lib/user-entitlements"
import { createSunoDifyClient } from "@/lib/suno-dify-client"
import {
  chargeSunoBaseCredits,
  chargeSunoTokenUsageIfPresent,
  createSunoChargeDescription,
  ensureSunoCredits,
  recordSunoBillingFailure,
} from "@/lib/suno-billing"
import {
  SUNO_MAX_UPLOAD_BYTES,
  SUNO_COST_OPERATIONS,
  buildDifyInputs,
  parseDifyResult,
  sunoRunRequestSchema,
  validateOperationInput,
  type SunoOperation,
  type SunoFormValues,
} from "@/lib/suno-workflow-schema"
import { sanitizePublicAiError } from "@/lib/chat-error-sanitizer"

export const dynamic = "force-dynamic"

const FILE_OPERATIONS = new Set(["upload_s3", "upload_full", "upload_full_and_create"])

function sanitizeErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "服务暂时不可用")
  if (/config|missing|api[_-]?key|token|secret|authorization|env|environment|未配置|凭据|workflow/i.test(raw)) {
    return "音乐服务暂时不可用，请稍后重试。"
  }
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_SECRET]")
    .replace(/gateway_api_key["':\s]+[^"',\s}]+/gi, "gateway_api_key:[REDACTED]")
    .slice(0, 500)
}

function toPublicSunoResult(result: ReturnType<typeof parseDifyResult>, success: boolean, httpStatus?: number) {
  return {
    success,
    http_status: httpStatus,
    task_id: result.task_id || "",
    clip_id: result.clip_id || "",
    upload_id: result.upload_id || "",
    status: result.status || "",
    audio_urls: result.audio_urls || [],
    image_urls: result.image_urls || [],
    video_urls: result.video_urls || [],
    wav_url: result.wav_url || "",
    error: result.error ? sanitizePublicAiError(sanitizeErrorMessage(result.error), "音乐服务暂时不可用，请稍后重试。") : null,
  }
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
    const entitlement = await getUserEntitlementSummary(auth.user!.id, {
      email: auth.user!.email || null,
      phone: auth.user!.phone || null,
      metadata: auth.user!.metadata || null,
    })
    const realCreditUserId = entitlement?.entitlementUserId || auth.user!.id

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

    const billableOperation = SUNO_COST_OPERATIONS.has(operation as SunoOperation)
    if (billableOperation) {
      const creditGuard = await ensureSunoCredits(auth.user!.id, { realCreditUserId })
      if (creditGuard) return creditGuard
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
    const normalized = parseDifyResult(result.response_json || result)
    const successfulProviderResult = Boolean(result.success && normalized.success)

    if (billableOperation && successfulProviderResult) {
      const referenceId = normalized.task_id || normalized.clip_id || normalized.upload_id || null
      const description = createSunoChargeDescription(operation)
      const charged = await chargeSunoBaseCredits({
        userId: auth.user!.id,
        realCreditUserId,
        operation,
        description,
        referenceId,
      })
      if (!charged) {
        await recordSunoBillingFailure({
          userId: auth.user!.id,
          operation,
          description,
          referenceId,
        })
        return NextResponse.json({ success: false, error: "积分扣除失败，请重试", code: "CREDITS_DEDUCT_FAILED" }, { status: 500 })
      }
      await chargeSunoTokenUsageIfPresent({
        userId: auth.user!.id,
        realCreditUserId,
        operation,
        providerPayload: result.response_json || result,
        referenceId,
      })
    }

    const publicResult = toPublicSunoResult(normalized, result.success, result.http_status)
    return NextResponse.json(publicResult, { status: result.http_status && result.http_status >= 400 ? result.http_status : 200 })
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error || "")
    const status = rawMessage.startsWith("SUNO_WORKFLOW_CONFIG_MISSING") ? 503 : 500
    const publicMessage = sanitizePublicAiError(sanitizeErrorMessage(error), "音乐服务暂时不可用，请稍后重试。")
    return NextResponse.json({ success: false, error: publicMessage }, { status })
  }
}
