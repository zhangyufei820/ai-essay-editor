import type { UIMessage } from "ai"
import { getAPIConfig } from "@/lib/ai-utils"

export const maxDuration = 30

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-AI-Provider, X-AI-Model',
    },
  })
}

export async function POST(req: Request) {
  try {
    console.log("[v0] Chat API called")

    const body = await req.json()
    const { messages, files, extractedText }: { messages: any[]; files?: any[]; extractedText?: string } = body

    console.log("[v0] Received messages:", messages.length)
    if (files && files.length > 0) {
      console.log("[v0] Received files:", files.length)
    }
    if (extractedText) {
      console.log("[v0] Has extracted text:", extractedText.length, "characters")
    }
    console.log("[v0] First message:", JSON.stringify(messages[0]))

    const isEssayRequest = extractedText && extractedText.length > 100
    if (isEssayRequest) {
      console.log("[v0] Detected essay with extracted text, triggering grading workflow...")

      try {
        const essayGradeResponse = await fetch(`${req.url.replace("/api/chat", "/api/essay-grade")}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            essayText: extractedText,
            gradeLevel: "初中",
            topic: "作文批改",
            wordLimit: "800字",
          }),
        })

        if (!essayGradeResponse.ok) {
          throw new Error("Essay grading failed")
        }

        const essayResult = await essayGradeResponse.json()

        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          start(controller) {
            const resultJSON = JSON.stringify(essayResult.result, null, 2)
            const fullText = "\`\`\`json\n" + resultJSON + "\n\`\`\`"

            const aiSDKChunk = `0:${JSON.stringify({ type: "text-delta", textDelta: fullText })}\n`
            controller.enqueue(encoder.encode(aiSDKChunk))

            const finishChunk = `0:${JSON.stringify({ type: "finish", finishReason: "stop" })}\n`
            controller.enqueue(encoder.encode(finishChunk))
            controller.close()
          },
        })

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "X-Vercel-AI-Data-Stream": "v1",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            'Access-Control-Allow-Origin': '*',
          },
        })
      } catch (error) {
        console.error("[v0] Essay grading error:", error)
        throw new Error("Essay grading failed")
      }
    }

    const provider = req.headers.get("X-AI-Provider") || "openai"
    const modelName = req.headers.get("X-AI-Model") || "gpt-4o"
    console.log("[v0] Provider:", provider, "Model:", modelName)

    const customConfig = getAPIConfig(provider)

    if (!customConfig) {
      return new Response(JSON.stringify({ error: "API configuration not found" }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const apiMessages = messages.map((msg, index) => {
      let textContent = ""

      if (msg.parts && Array.isArray(msg.parts)) {
        textContent = msg.parts
          .filter((part: any) => part.type === "text")
          .map((part: any) => part.text)
          .join("\n")
      } else if (msg.content) {
        if (Array.isArray(msg.content)) {
          textContent = msg.content
            .filter((part: any) => part.type === "text")
            .map((part: any) => part.text)
            .join("\n")
        } else if (typeof msg.content === "string") {
          textContent = msg.content
        } else {
          textContent = String(msg.content || "")
        }
      } else {
        textContent = ""
      }

      if (index === messages.length - 1 && msg.role === "user" && files && files.length > 0) {
        const hasImages = files.some((file) => file.type.startsWith("image/"))

        if (hasImages) {
          const content: any[] = []

          if (textContent.trim()) {
            content.push({
              type: "text",
              text: textContent,
            })
          }

          for (const file of files) {
            if (file.type.startsWith("image/")) {
              content.push({
                type: "image_url",
                image_url: {
                  url: file.data,
                },
              })
            } else if (file.type === "text/plain") {
              try {
                const base64Data = file.data.split(",")[1]
                const fileTextContent = Buffer.from(base64Data, "base64").toString("utf-8")
                content.push({
                  type: "text",
                  text: `\n\n[文件: ${file.name}]\n${fileTextContent}`,
                })
              } catch (err) {
                console.error("[v0] Error decoding text file:", err)
              }
            } else if (file.type === "application/pdf" || file.type.includes("word")) {
              content.push({
                type: "text",
                text: `\n\n[文件: ${file.name}]\n这是一个${file.type.includes("pdf") ? "PDF" : "Word"}文档。由于技术限制，暂时无法直接读取文档内容。请将文档内容复制粘贴到对话框中。`,
              })
            }
          }

          return {
            role: msg.role,
            content: content,
          }
        } else {
          let fileContext = ""
          for (const file of files) {
            if (file.type === "text/plain") {
              try {
                const base64Data = file.data.split(",")[1]
                const fileTextContent = Buffer.from(base64Data, "base64").toString("utf-8")
                fileContext += `\n\n[文件: ${file.name}]\n${fileTextContent}`
              } catch (err) {
                console.error("[v0] Error decoding text file:", err)
              }
            } else if (file.type === "application/pdf" || file.type.includes("word")) {
              fileContext += `\n\n[文件: ${file.name}]\n这是一个${file.type.includes("pdf") ? "PDF" : "Word"}文档。由于技术限制，暂时无法直接读取文档内容。请将文档内容复制粘贴到对话框中。`
            }
          }

          return {
            role: msg.role,
            content: textContent + fileContext,
          }
        }
      }

      return {
        role: msg.role,
        content: textContent,
      }
    })

    console.log("[v0] API messages:", JSON.stringify(apiMessages))
    console.log("[v0] Calling API:", customConfig.baseURL)

    const response = await fetch(`${customConfig.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: apiMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 4000,
      }),
    })

    console.log("[v0] Response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] API error:", response.status, errorText)
      return new Response(JSON.stringify({ error: `API error: ${response.status}` }), {
        status: response.status,
        headers: { 
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader()
        if (!reader) {
          console.log("[v0] No reader available")
          controller.close()
          return
        }

        try {
          let buffer = ""

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const decoded = decoder.decode(value, { stream: true })
            buffer += decoded
            const lines = buffer.split("\n")
            buffer = lines.pop() || ""

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || trimmed === "data: [DONE]") continue

              if (trimmed.startsWith("data: ")) {
                try {
                  const jsonStr = trimmed.slice(6)
                  const data = JSON.parse(jsonStr)

                  if (data.choices && data.choices[0]?.delta?.content) {
                    const content = data.choices[0].delta.content
                    const aiSDKChunk = `0:${JSON.stringify({ type: "text-delta", textDelta: content })}\n`
                    controller.enqueue(encoder.encode(aiSDKChunk))
                  } else if (data.choices && data.choices[0]?.finish_reason) {
                    const finishChunk = `0:${JSON.stringify({ type: "finish", finishReason: data.choices[0].finish_reason })}\n`
                    controller.enqueue(encoder.encode(finishChunk))
                  }
                } catch (e) {
                  console.error("[v0] Error parsing chunk:", e)
                }
              }
            }
          }

          console.log("[v0] Stream completed")
          controller.close()
        } catch (error) {
          console.error("[v0] Stream error:", error)
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Vercel-AI-Data-Stream": "v1",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error("[v0] Chat API error:", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { 
        "Content-Type": "application/json",
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}
