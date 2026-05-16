import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import path from "path"
import { getClientIP, checkIpRateLimit, createRateLimitResponse } from "@/lib/rate-limit"
import { internalDifyFetch } from "@/lib/internal-dify-fetch"
import { getDifyCredentialForModel } from "@/lib/dify-credentials"
import { createRequestId, sanitizeForTrace } from "@/lib/ai-task-trace"
import { requireUser } from "@/lib/auth/verified-user"

// ✅ 修改 1: 切换回 Node.js 运行时，以支持更大的文件和更稳定的上传
export const runtime = "nodejs" 

// 可选：设置最大执行时间（秒），防止上传大文件超时
export const maxDuration = 60;

// ============================================
// 安全限制配置
// ============================================

// ✅ 安全校验：允许的文件 MIME 类型
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  // 语音文件类型
  "audio/webm",
  "audio/mp3",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav"
]

// ✅ 安全校验：允许的文件扩展名
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".txt", ".docx", ".webm", ".mp3", ".ogg", ".wav"]

// ✅ 安全校验：docker-nginx-1 100M 上限
const MAX_FILE_SIZE_VERCEL = 100 * 1024 * 1024

const DIFY_BASE_URL = (process.env.DIFY_INTERNAL_URL
  || process.env.DIFY_BASE_URL
  || "https://api.dify.ai/v1").replace(/\/+$/, "")

// 🔥 图片网关配置
// 服务端优先使用 Docker 内网地址，返回给浏览器/Dify 的图片 URL 使用公网地址。
const IMAGE_GATEWAY_URL = (process.env.DIFY_IMAGE_GATEWAY_URL || "http://dify-image-gateway:8001").replace(/\/+$/, "")
const IMAGE_GATEWAY_PUBLIC_URL = (
  process.env.DIFY_IMAGE_GATEWAY_PUBLIC_URL ||
  process.env.NEXT_PUBLIC_DIFY_IMAGE_GATEWAY_URL ||
  "https://api.shenxiang.school"
).replace(/\/+$/, "")
const PUBLIC_APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  "https://shenxiang.school"
).replace(/\/+$/, "")

// 🔥 作文批改（standard）使用专用的 ESSAY_CORRECTION_API_KEY
const DEFAULT_DIFY_KEY = process.env.ESSAY_CORRECTION_API_KEY || process.env.DIFY_API_KEY

// 🔥 根据模型获取对应的 API Key（与 dify-chat 保持一致）
function getApiKeyForModel(model: string | null): string {
  return getDifyCredentialForModel(model, process.env, DEFAULT_DIFY_KEY).credential
}

// ============================================
// 安全校验函数
// ============================================

/**
 * ✅ 安全校验：验证文件类型 (MIME)
 */
function validateFileType(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { 
      valid: false, 
      error: `不支持的文件格式: ${file.type || '未知类型'}` 
    }
  }
  return { valid: true }
}

/**
 * ✅ 安全校验：验证文件扩展名
 */
function validateFileExtension(fileName: string): { valid: boolean; safeExt?: string; error?: string } {
  const ext = path.extname(fileName).toLowerCase()
  
  if (!ext) {
    return { valid: false, error: "文件缺少扩展名" }
  }
  
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `不允许的文件后缀: ${ext}` }
  }
  
  return { valid: true, safeExt: ext }
}

/**
 * ✅ 安全校验：验证文件大小
 */
function validateFileSize(file: File, maxSize: number = MAX_FILE_SIZE_VERCEL): { valid: boolean; error?: string } {
  if (file.size > maxSize) {
    const maxSizeMB = (maxSize / 1024 / 1024).toFixed(1)
    return { 
      valid: false, 
      error: `文件过大 (${(file.size / 1024 / 1024).toFixed(1)}MB)，超过 ${maxSizeMB}限制` 
    }
  }
  return { valid: true }
}

/**
 * ✅ 安全校验：生成安全的随机文件名
 */
function generateSafeFileName(originalExt: string): string {
  return `${randomUUID()}${originalExt}`
}

function getRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host")
  const host = forwardedHost || request.headers.get("host")
  const forwardedProto = request.headers.get("x-forwarded-proto")

  if (host) {
    const proto = forwardedProto || (host.includes("localhost") ? "http" : "https")
    return `${proto}://${host}`.replace(/\/+$/, "")
  }

  return PUBLIC_APP_URL
}

function buildModelAccessibleImageUrl(request: NextRequest, gatewayUrl: string): string {
  const origin = PUBLIC_APP_URL || getRequestOrigin(request)
  const params = new URLSearchParams({
    url: gatewayUrl,
    raw: "1",
  })

  return `${origin}/api/image-proxy/raw/image.png?${params.toString()}`
}

function shouldUseImageGateway(model: string | null) {
  return model === "gpt-image-2"
}

async function uploadFileToDify(file: File, userId: string, apiKey: string) {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("user", userId)

  const response = await internalDifyFetch(`${DIFY_BASE_URL}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  })

  const bodyText = await response.text()
  let payload: Record<string, unknown> = {}
  try {
    payload = JSON.parse(bodyText)
  } catch {
    payload = {}
  }

  if (!response.ok) {
    throw new Error(`Dify upload failed: ${response.status} ${bodyText.slice(0, 200)}`)
  }

  const id = payload.id || (payload.data as Record<string, unknown> | undefined)?.id
  return typeof id === "string" ? id : ""
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("X-Request-Id") || createRequestId("upload")
  // IP 限流：10次/分钟
  const ip = getClientIP(request)
  const limitResult = checkIpRateLimit(ip, 10)
  if (!limitResult.allowed) {
    return createRateLimitResponse(limitResult.retryAfter!)
  }

  // ✅ 检查 API Key 配置
  if (!DEFAULT_DIFY_KEY) {
    return new Response(JSON.stringify({ error: "Dify API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
    })
  }

  try {
    // ============================================
    // 0. 大文件预检：Vercel/Node API 限制 4.5MB，超出引导使用直连
    // ============================================
    const contentLength = request.headers.get("content-length")
    if (contentLength) {
      const size = parseInt(contentLength, 10)
      if (size > MAX_FILE_SIZE_VERCEL) {
        console.warn(`[Upload Security] 文件过大 (${(size/1024/1024).toFixed(1)}MB)，超过 API 限制 (4.5MB)`)
        return new Response(JSON.stringify({
          error: `文件过大 (${(size/1024/1024).toFixed(1)}MB)，超过服务器限制 100MB`,
          code: "FILE_TOO_LARGE",
          hint: "请压缩文件后重试"
        }), {
          status: 413,
          headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
        })
      }
    }

    const auth = await requireUser(request)
    if (auth.response) return auth.response
    // 🔥 从 header 获取当前选择的模型
    const model = request.headers.get("X-Model") || null

    const formData = await request.formData()
    const file = formData.get("file") as File
    const userId = auth.user!.id
    // 也支持从 formData 获取模型（兼容旧版本）
    const modelFromForm = formData.get("model") as string | null

    // ============================================
    // 1. 存在性校验
    // ============================================
    if (!file) {
      return new Response(JSON.stringify({ error: "未选择文件" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      })
    }

    // 🔐 二次验证：确保有用户身份
    if (!userId) {
      return new Response(JSON.stringify({ error: "未授权访问，请先登录" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      })
    }

    // ============================================
    // 2. 安全校验：文件大小
    // ============================================
    const sizeCheck = validateFileSize(file)
    if (!sizeCheck.valid) {
      console.warn(`[Upload Security] 文件大小校验失败: ${file.name} - ${sizeCheck.error}`)
      return new Response(JSON.stringify({ 
        error: sizeCheck.error,
        code: "FILE_TOO_LARGE",
        hint: "请压缩文件后重试"
      }), {
        status: 413,
        headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      })
    }

    // ============================================
    // 3. 安全校验：文件类型 (MIME)
    // ============================================
    const typeCheck = validateFileType(file)
    if (!typeCheck.valid) {
      console.warn(`[Upload Security] 文件类型校验失败: ${file.name} - ${typeCheck.error}`)
      return new Response(JSON.stringify({ 
        error: typeCheck.error,
        code: "INVALID_FILE_TYPE"
      }), {
        status: 415,
        headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      })
    }

    // ============================================
    // 4. 安全校验：文件扩展名
    // ============================================
    const extCheck = validateFileExtension(file.name)
    if (!extCheck.valid) {
      console.warn(`[Upload Security] 文件扩展名校验失败: ${file.name} - ${extCheck.error}`)
      return new Response(JSON.stringify({ 
        error: extCheck.error,
        code: "INVALID_EXTENSION"
      }), {
        status: 403,
        headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      })
    }

    // ============================================
    // 5. 安全校验：生成安全的随机文件名
    // ============================================
    const safeFileName = generateSafeFileName(extCheck.safeExt!)
	    console.log(`[Upload] 安全校验通过: ${file.name} -> ${safeFileName} | 用户: ${userId} | 大小: ${(file.size / 1024 / 1024).toFixed(2)}MB | requestId=${requestId}`)

    // 🔥 根据模型选择正确的 API Key
    const targetModel = model || modelFromForm
    const targetApiKey = getApiKeyForModel(targetModel)
    if (!targetApiKey) {
      return new Response(JSON.stringify({ error: "目标模型上传凭据未配置" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      })
    }

    const safeFile = new File([file], safeFileName, { type: file.type })

    // 非 GPT Image 工作台必须走 Dify 原生 upload_file_id。
    // OpenClaw、作文批改、教学模型等 Dify 应用不可靠支持 remote_url。
    if (!shouldUseImageGateway(targetModel)) {
      try {
        const difyFileId = await uploadFileToDify(safeFile, userId, targetApiKey)
        if (!difyFileId) {
          throw new Error("Dify upload succeeded but did not return an upload_file_id")
        }

        console.log("[Backend] Dify upload success:", {
          fileName: safeFileName,
          userId,
          model: targetModel,
          difyFileId,
        })

        return new Response(JSON.stringify({
          success: true,
          code: "ok",
          message: "文件上传成功",
          id: difyFileId,
          data: {
            id: difyFileId,
            filename: safeFileName,
            content_type: file.type,
            size: file.size,
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
        })
      } catch (error) {
        console.error("[Backend] Dify upload failed:", {
          fileName: safeFileName,
          userId,
          model: targetModel,
          error: error instanceof Error ? error.message : String(error),
        })

        return new Response(JSON.stringify({
          error: "File upload to Dify failed",
          details: sanitizeForTrace(error instanceof Error ? error.message : String(error)),
          status: 502,
        }), {
          status: 502,
          headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
        })
      }
    }

    // ============================================
    // 6. 上传到图片网关（而非直接上传到 Dify）
    // ============================================
    // 创建一个新的 FormData，使用安全的文件名
    const gatewayFormData = new FormData()
    gatewayFormData.append("file", safeFile)
    gatewayFormData.append("user", userId || "anonymous-user")

    // 🔥 使用图片网关认证令牌
    const gatewayToken = process.env.DIFY_IMAGE_GATEWAY_TOKEN
    if (!gatewayToken) {
      return NextResponse.json({ error: "图片网关未配置" }, { status: 503 })
    }
    const uploadUrl = `${IMAGE_GATEWAY_URL}/api/files/upload`

    const gatewayResponse = await internalDifyFetch(uploadUrl, {
      method: "POST",
      headers: {
        "x-gateway-token": gatewayToken,
        Authorization: `Bearer ${gatewayToken}`,
      },
      body: gatewayFormData,
    })

    if (!gatewayResponse.ok) {
      const errorText = await gatewayResponse.text()
      console.error("[Backend] Gateway upload failed:", {
        status: gatewayResponse.status,
        url: uploadUrl,
        error: sanitizeForTrace(errorText),
      })

      return new Response(
        JSON.stringify({
          error: "File upload to gateway failed",
          details: sanitizeForTrace(errorText),
          status: gatewayResponse.status,
        }),
        {
          status: gatewayResponse.status,
          headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
        },
      )
    }

    const gatewayData = await gatewayResponse.json()
    if (gatewayData?.success === false) {
      console.error("[Backend] Gateway upload returned failure:", {
        fileName: safeFileName,
        code: gatewayData.code,
        message: gatewayData.message,
      })

      return new Response(
        JSON.stringify({
          error: "File upload to gateway failed",
          details: gatewayData.message || "Gateway upload returned failure",
          status: 502,
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
        },
      )
    }

    const gatewayFilename = gatewayData.data?.filename || gatewayData.filename || safeFileName
    const gatewayUrl =
      (gatewayFilename ? `${IMAGE_GATEWAY_PUBLIC_URL}/images/uploads/${encodeURIComponent(path.basename(gatewayFilename))}` : undefined) ||
      gatewayData.data?.url?.replace(IMAGE_GATEWAY_URL, IMAGE_GATEWAY_PUBLIC_URL) ||
      gatewayData.url?.replace(IMAGE_GATEWAY_URL, IMAGE_GATEWAY_PUBLIC_URL)

    if (!gatewayUrl) {
      console.error("[Backend] Gateway upload missing public URL:", {
        fileName: safeFileName,
        responseKeys: Object.keys(gatewayData || {}),
        dataKeys: Object.keys(gatewayData?.data || {}),
      })

      return new Response(
        JSON.stringify({
          error: "Gateway upload did not return a public image URL",
          status: 502,
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
        },
      )
    }

    console.log("[Backend] Gateway upload success:", {
      fileName: safeFileName,
      userId,
      gatewayUrl,
    })

    const modelUrl = buildModelAccessibleImageUrl(request, gatewayUrl)

    // 返回图片结果：gatewayUrl 用于内部追踪，modelUrl 是给外部模型拉取的 HTTPS 地址。
    return new Response(JSON.stringify({
      success: true,
      code: "ok",
      message: "文件上传成功",
      data: {
        url: modelUrl,
        gateway_url: gatewayUrl,
        model_url: modelUrl,
        filename: safeFileName,
        content_type: file.type,
        size: file.size,
      },
      gatewayUrl,
      modelUrl,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
    })
  } catch (error) {
    console.error("[Backend] Upload error:", error)
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: sanitizeForTrace(error instanceof Error ? error.message : String(error)),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      },
    )
  }
}
