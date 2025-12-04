import type { NextRequest } from "next/server"

// ✅ 修改 1: 切换回 Node.js 运行时，以支持更大的文件和更稳定的上传
export const runtime = "nodejs" 

// 可选：设置最大执行时间（秒），防止上传大文件超时
export const maxDuration = 60; 

const DIFY_BASE_URL = process.env.DIFY_BASE_URL || "https://api.dify.ai/v1"
const DIFY_API_KEY = process.env.DIFY_API_KEY

export async function POST(request: NextRequest) {
  if (!DIFY_API_KEY) {
    return new Response(JSON.stringify({ error: "Dify API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    // ✅ 修改 2: 获取前端传来的真实用户 ID
    const userId = formData.get("user") as string 

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const difyFormData = new FormData()
    difyFormData.append("file", file)
    // ✅ 修改 3: 使用真实的用户 ID，保持与对话接口一致
    difyFormData.append("user", userId || "anonymous-user") 

    // Dify 文件上传的正确端点
    const uploadUrl = `${DIFY_BASE_URL}/files/upload`

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DIFY_API_KEY}`,
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

    return new Response(JSON.stringify(data), {
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