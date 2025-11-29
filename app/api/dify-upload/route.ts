import type { NextRequest } from "next/server"

export const runtime = "edge"

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

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const difyFormData = new FormData()
    difyFormData.append("file", file)
    difyFormData.append("user", `user-${Date.now()}`)

    // Dify 文件上传的正确端点
    const uploadUrl = `${DIFY_BASE_URL}/files/upload`

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DIFY_API_KEY}`,
      },
      body: difyFormData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] Dify upload failed:", {
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
    console.log("[v0] Dify upload success:", { fileId: data.id, fileName: file.name })

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("[v0] Upload error:", error)
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
