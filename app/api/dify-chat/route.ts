import type { NextRequest } from "next/server"

export const runtime = "edge"
export const maxDuration = 60

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
    const body = await request.json()
    const { query, conversationId, fileIds } = body

    const difyRequest: any = {
      inputs: {},
      query: query || "请帮我批改这篇作文",
      response_mode: "streaming",
      user: "user-" + Date.now(),
    }

    if (fileIds && fileIds.length > 0) {
      difyRequest.files = fileIds.map((id: string) => ({
        type: "image",
        transfer_method: "local_file",
        upload_file_id: id,
      }))
    }

    if (conversationId && conversationId.trim() !== "") {
      difyRequest.conversation_id = conversationId
    }

    const difyUrl = `${DIFY_BASE_URL}/chat-messages`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55000)

    const response = await fetch(difyUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DIFY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(difyRequest),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      return new Response(JSON.stringify({ error: "Dify API request failed", details: errorText }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader()
        if (!reader) {
          controller.close()
          return
        }

        const decoder = new TextDecoder()
        let buffer = ""

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() || ""

            for (const line of lines) {
              if (!line.trim() || !line.startsWith("data: ")) continue

              const data = line.slice(6).trim()
              if (data === "[DONE]") continue

              try {
                const parsed = JSON.parse(data)
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`))
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }

          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
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
