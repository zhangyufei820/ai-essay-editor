import type { NextRequest } from "next/server"
import { uploadBufferToCos } from "@/lib/cos"

// ✅ 修改 1: 切换回 Node.js 运行时，以支持更大的文件和更稳定的上传
export const runtime = "nodejs" 

// 可选：设置最大执行时间（秒），防止上传大文件超时
export const maxDuration = 60;

const DIFY_BASE_URL = process.env.DIFY_BASE_URL || "https://api.dify.ai/v1"
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
    default:
      return DEFAULT_DIFY_KEY || "";
  }
}

export async function POST(request: NextRequest) {
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

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
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

    // 🔥 根据模型选择正确的 API Key
    const targetModel = model || modelFromForm
    const targetApiKey = getApiKeyForModel(targetModel)
    
    console.log(`[Upload] 用户: ${userId} | 模型: ${targetModel || "default"} | 文件: ${file.name}`)

    const difyFormData = new FormData()
    difyFormData.append("file", file)
    // ✅ 修改 3: 使用真实的用户 ID，保持与对话接口一致
    difyFormData.append("user", userId || "anonymous-user") 

    // Dify 文件上传的正确端点
    const uploadUrl = `${DIFY_BASE_URL}/files/upload`

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${targetApiKey}`,
        // 注意：使用 fetch 发送 FormData 时，通常不需要手动设置 Content-Type，
        // 浏览器/Node环境会自动生成带 boundary 的正确 Header
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
    console.log("[Backend] Dify upload success:", { fileId: data.id, fileName: file.name, userId })

    // 🔥 同时上传到腾讯云 COS（用于永久存储）
    let cosUrl: string | undefined
    try {
      // 将文件转换为 Buffer
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      
      // 获取文件扩展名
      const fileExt = file.name.split('.').pop() || 'jpg'
      
      // 直接上传 Buffer 到 COS
      const cosResult = await uploadBufferToCos(
        buffer,
        targetModel === 'banana-2-pro' || targetModel === 'banana' ? 'banana' : 'other',
        fileExt,
        file.name
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
