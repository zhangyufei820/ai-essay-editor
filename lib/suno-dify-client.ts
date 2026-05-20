import "server-only"

import { internalDifyFetch } from "@/lib/internal-dify-fetch"
import {
  type DifyFileInput,
  type DifyWorkflowInputs,
  type SunoWorkflowResult,
  parseDifyResult,
} from "@/lib/suno-workflow-schema"

type RunWorkflowOptions = {
  inputs: DifyWorkflowInputs
  user: string
}

type UploadFileOptions = {
  file: File
  user: string
}

function normalizeDifyBaseUrl(value: string | undefined) {
  const base = (value || "https://api.dify.ai").replace(/\/+$/, "")
  return base.endsWith("/v1") ? base : `${base}/v1`
}

function getDifyConfig() {
  const baseUrl = normalizeDifyBaseUrl(process.env.DIFY_INTERNAL_URL || process.env.DIFY_BASE_URL)
  const apiKey = process.env.DIFY_API_KEY || ""
  const workflowUser = process.env.DIFY_WORKFLOW_USER || "website-user"
  const gatewayBaseUrl = (process.env.SUNO_GATEWAY_BASE_URL || "").replace(/\/+$/, "")
  const gatewayApiKey = process.env.SUNO_GATEWAY_API_KEY || ""

  return { baseUrl, apiKey, workflowUser, gatewayBaseUrl, gatewayApiKey }
}

async function readDifyJson(response: Response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: text }
  }
}

function assertConfigured() {
  const config = getDifyConfig()
  const missing = [
    !config.apiKey && "DIFY_API_KEY",
    !config.gatewayBaseUrl && "SUNO_GATEWAY_BASE_URL",
    !config.gatewayApiKey && "SUNO_GATEWAY_API_KEY",
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new Error(`SUNO_WORKFLOW_CONFIG_MISSING:${missing.join(",")}`)
  }

  return config
}

export class SunoDifyClient {
  async uploadFile({ file, user }: UploadFileOptions): Promise<DifyFileInput> {
    const config = assertConfigured()
    const form = new FormData()
    form.set("file", file, file.name)
    form.set("user", user || config.workflowUser)

    const response = await internalDifyFetch(`${config.baseUrl}/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: form,
    })
    const payload = await readDifyJson(response)

    if (!response.ok) {
      throw new Error(`DIFY_FILE_UPLOAD_FAILED:${response.status}:${JSON.stringify(payload).slice(0, 300)}`)
    }

    const uploadFileId = String((payload as Record<string, unknown>).id || "")
    if (!uploadFileId) {
      throw new Error("DIFY_FILE_UPLOAD_MISSING_ID")
    }

    return {
      type: "audio",
      transfer_method: "local_file",
      upload_file_id: uploadFileId,
    }
  }

  async runWorkflow({ inputs, user }: RunWorkflowOptions): Promise<SunoWorkflowResult> {
    const config = assertConfigured()
    const injectedInputs: DifyWorkflowInputs = {
      ...inputs,
      gateway_base_url: config.gatewayBaseUrl,
      gateway_api_key: config.gatewayApiKey,
    }

    const response = await internalDifyFetch(`${config.baseUrl}/workflows/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: injectedInputs,
        response_mode: "blocking",
        user: user || config.workflowUser,
      }),
    })
    const payload = await readDifyJson(response)
    const parsed = parseDifyResult(payload)

    return {
      ...parsed,
      success: response.ok && parsed.success,
      http_status: response.status,
      response_json: payload,
      error: response.ok ? parsed.error : payload,
    }
  }
}

export function createSunoDifyClient() {
  return new SunoDifyClient()
}
