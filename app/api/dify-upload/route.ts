import type { NextRequest } from "next/server"
import { randomUUID } from "crypto"
import path from "path"
import { getClientIP, checkIpRateLimit, createRateLimitResponse } from "@/lib/rate-limit"

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

const DIFY_BASE_URL = process.env.DIFY_INTERNAL_URL
  || process.env.DIFY_BASE_URL
  || "https://api.dify.ai"

// 🔥 图片网关配置
const IMAGE_GATEWAY_URL = process.env.DIFY_IMAGE_GATEWAY_URL || "http://43.154.111.156:8001"

// 🔥 作文批改（standard）使用专用的 ESSAY_CORRECTION_API_KEY
const DEFAULT_DIFY_KEY = process.env.ESSAY_CORRECTION_API_KEY || process.env.DIFY_API_KEY

// 🔥 根据模型获取对应的 API Key（与 dify-chat 保持一致）
function getApiKeyForModel(model: string | null): string {
  switch (model) {
    case "teaching-pro":
      return process.env.DIFY_TEACHING_PRO_API_KEY || DEFAULT_DIFY_KEY || "";
    case "gpt-5":
      return process.env.DIFY_API_KEY_GPT5 || DEFAULT_DIFY_KEY || "";
    case "claude-opus":
      return process.env.DIFY_API_KEY_CLAUDE || DEFAULT_DIFY_KEY || "";
    case "gemini-pro":
      return process.env.DIFY_API_KEY_GEMINI || DEFAULT_DIFY_KEY || "";
    case "banana":
    case "banana-2-pro":
      return process.env.DIFY_BANANA_API_KEY || DEFAULT_DIFY_KEY || "";
    case "gpt-image-2":
      return process.env.DIFY_GPT_IMAGE_API_KEY || DEFAULT_DIFY_KEY || "";
    case "grok-4.2":
      return process.env.DIFY_API_KEY_GROK42 || DEFAULT_DIFY_KEY || "";
    case "open-claw":
      return process.env.DIFY_API_KEY_OPENCLAW || DEFAULT_DIFY_KEY || "";
    default:
      return DEFAULT_DIFY_KEY || "";
  }
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

export async function POST(request: NextRequest) {
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
      headers: { "Content-Type": "application/json" },
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
          headers: { "Content-Type": "application/json" },
        })
      }
    }

    // 🔐 从 header 获取用户身份（middleware 已验证）
    const headerUserId = request.headers.get("X-User-Id")
    // 🔥 从 header 获取当前选择的模型
    const model = request.headers.get("X-Model") || null

    const formData = await request.formData()
    const file = formData.get("file") as File
    // 优先使用 header 中的 userId，其次使用 formData 中的
    const userId = headerUserId || formData.get("user") as string 
    // 也支持从 formData 获取模型（兼容旧版本）
    const modelFromForm = formData.get("model") as string | null

    // ============================================
    // 1. 存在性校验
    // ============================================
    if (!file) {
      return new Response(JSON.stringify({ error: "未选择文件" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    // 🔐 二次验证：确保有用户身份
    if (!userId) {
      return new Response(JSON.stringify({ error: "未授权访问，请先登录" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
      })
    }

    // ============================================
    // 5. 安全校验：生成安全的随机文件名
    // ============================================
    const safeFileName = generateSafeFileName(extCheck.safeExt!)
    console.log(`[Upload] 安全校验通过: ${file.name} -> ${safeFileName} | 用户: ${userId} | 大小: ${(file.size / 1024 / 1024).toFixed(2)}MB`)

    // 🔥 根据模型选择正确的 API Key
    const targetModel = model || modelFromForm
    const targetApiKey = getApiKeyForModel(targetModel)

    // ============================================
    // 6. 上传到图片网关（而非直接上传到 Dify）
    // ============================================
    // 创建一个新的 FormData，使用安全的文件名
    const gatewayFormData = new FormData()
    const safeFile = new File([file], safeFileName, { type: file.type })
    gatewayFormData.append("file", safeFile)
    gatewayFormData.append("user", userId || "anonymous-user")

    // 🔥 使用图片网关认证令牌
    const gatewayToken = process.env.DIFY_IMAGE_GATEWAY_TOKEN || DEFAULT_DIFY_KEY
    const uploadUrl = `${IMAGE_GATEWAY_URL}/api/files/upload`

    const gatewayResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gatewayToken}`,
      },
      body: gatewayFormData,
    })

    if (!gatewayResponse.ok) {
      const errorText = await gatewayResponse.text()
      console.error("[Backend] Gateway upload failed:", {
        status: gatewayResponse.status,
        url: uploadUrl,
        error: errorText,
      })

      return new Response(
        JSON.stringify({
          error: "File upload to gateway failed",
          details: errorText,
          status: gatewayResponse.status,
        }),
        {
          status: gatewayResponse.status,
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    const gatewayData = await gatewayResponse.json()
    const gatewayFilename = gatewayData.data?.filename || gatewayData.filename || safeFileName
    const gatewayUrl =
      gatewayData.data?.url ||
      gatewayData.url ||
      (gatewayFilename ? `${IMAGE_GATEWAY_URL.replace(/\/+$/, "")}/images/${encodeURIComponent(path.basename(gatewayFilename))}` : undefined)

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
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    console.log("[Backend] Gateway upload success:", {
      fileName: safeFileName,
      userId,
      gatewayUrl,
    })

    // 返回网关上传结果（包含公网 URL）
    // 前端应使用 gatewayUrl 作为 Dify inputs.reference_image_url
    return new Response(JSON.stringify({
      success: true,
      code: "ok",
      message: "文件上传成功",
      data: {
        url: gatewayUrl,                   // 🔥 图片网关公网 URL（用于 reference_image_url）
        filename: safeFileName,
        content_type: file.type,
        size: file.size,
      },
      gatewayUrl,                          // 🔥 兼容字段
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("[Backend] Upload error:", error)
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    )
  }
}
