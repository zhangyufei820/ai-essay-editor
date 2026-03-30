import type { NextRequest } from "next/server"
import { uploadBufferToCos } from "@/lib/cos"
import { randomUUID } from "crypto"
import path from "path"

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
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" // .docx
]

// ✅ 安全校验：允许的文件扩展名
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".txt", ".docx"]

// ✅ 安全校验：Vercel 限制下的最大文件大小 (4.5MB)
// 大文件应走直连方案，此处作为 Vercel 层的安全防护
const MAX_FILE_SIZE_VERCEL = 4.5 * 1024 * 1024

// Lighthouse 服务器直连地址（用于大文件上传）
// 实际部署时替换为你的服务器地址
const LIGHTHOUSE_UPLOAD_URL = process.env.NEXT_PUBLIC_LIGHTHOUSE_UPLOAD_URL || ""

const DIFY_BASE_URL = process.env.DIFY_INTERNAL_URL
  || process.env.DIFY_BASE_URL
  || "https://api.dify.ai"
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
      error: `文件过大 (${(file.size / 1024 / 1024).toFixed(1)}MB)，超过 ${maxSizeMB}MB 限制。大文件请使用直连通道上传。` 
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
  // ✅ 检查 API Key 配置
  if (!DEFAULT_DIFY_KEY) {
    return new Response(JSON.stringify({ error: "Dify API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
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
        hint: "大文件请通过直连通道上传"
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
    // 6. 转发到 Dify
    // ============================================
    // 创建一个新的 FormData，使用安全的文件名
    const difyFormData = new FormData()
    // 注意：这里我们仍使用原始文件内容，但可以创建新 File 对象使用安全名称
    const safeFile = new File([file], safeFileName, { type: file.type })
    difyFormData.append("file", safeFile)
    difyFormData.append("user", userId || "anonymous-user")

    const uploadUrl = `${DIFY_BASE_URL}/files/upload`

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${targetApiKey}`,
      },
      body: difyFormData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[Backend] Dify upload failed:", {
        status: response.status,
        url: uploadUrl,
        error: errorText,
      })

      return new Response(
        JSON.stringify({
          error: "File upload to Dify failed",
          details: errorText,
          status: response.status,
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    const data = await response.json()
    console.log("[Backend] Dify upload success:", { fileId: data.id, fileName: safeFileName, userId })

    // ============================================
    // 7. 同时上传到腾讯云 COS（用于永久存储）
    // ============================================
    let cosUrl: string | undefined
    try {
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      
      const cosResult = await uploadBufferToCos(
        buffer,
        targetModel === 'banana-2-pro' || targetModel === 'banana' ? 'banana' : 'other',
        extCheck.safeExt!.replace('.', ''),
        safeFileName
      )
      
      if (cosResult.success && cosResult.cdnUrl) {
        cosUrl = cosResult.cdnUrl
        console.log("[Backend] COS upload success:", cosUrl)
      }
    } catch (cosError) {
      console.error("[Backend] COS upload failed (non-critical):", cosError)
      // COS 上传失败不影响主流程
    }

    // 返回结果（包含 Dify ID 和 COS URL）
    return new Response(JSON.stringify({
      ...data,
      cosUrl, // 添加 COS URL
      safeFileName, // 返回安全文件名供后续使用
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
