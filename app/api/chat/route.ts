import { createClient } from '@supabase/supabase-js'
import { getAPIConfig } from "@/lib/ai-utils"
import { getCorsHeaders, handleOptions } from '@/lib/cors'
import { calculateActualCost, type ModelType } from '@/lib/pricing'
import { assertSecureTlsConfiguration } from '@/lib/runtime-security'

export const maxDuration = 60

const CHAT_MODEL: ModelType = "standard"
const MIN_REQUIRED_CREDITS = 5

type ChatRequestBody = {
  messages: any[]
  files?: any[]
  extractedText?: string
  userId?: string
}

export async function OPTIONS(req: Request) {
  return handleOptions(req)
}

async function deductCredit(userId: string, totalTokens: number, description: string) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const currentCost = calculateActualCost(CHAT_MODEL, { totalTokens })
  const { data } = await supabaseAdmin
    .from('user_credits')
    .select('credits')
    .eq('user_id', userId)
    .single()

  if (!data) {
    console.error("[Billing] Missing credit row during deduction")
    return
  }

  const currentCredits = data.credits
  const newCredits = Math.max(0, currentCredits - currentCost)

  const updateResult = await supabaseAdmin
    .from('user_credits')
    .update({ credits: newCredits })
    .eq('user_id', userId)
    .eq('credits', currentCredits)
    .select('credits')
    .single()

  if (updateResult.error || !updateResult.data) {
    console.error("[Billing] Deduction update failed:", updateResult.error)
    return
  }

  const { error: txError } = await supabaseAdmin
    .from('credit_transactions')
    .insert({
      user_id: userId,
      amount: -currentCost,
      type: 'consume',
      description,
      balance_before: currentCredits,
      balance_after: newCredits,
    })

  if (txError) {
    console.error("[Billing] Transaction log failed:", txError)
    return
  }

  console.log(`[Billing] Charged ${currentCost} credits for ${totalTokens} tokens, user=${userId}, remaining=${newCredits}`)
}

function createMeteredStreamResponse(
  upstreamResponse: Response,
  req: Request,
  userId: string,
  description: string
) {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let totalTokens = 0
  let hasReceivedContent = false
  let buffer = ""

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstreamResponse.body?.getReader()
      if (!reader) {
        controller.close()
        return
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith("data: ")) continue

            const jsonStr = trimmed.slice(6)
            if (!jsonStr || jsonStr === "[DONE]") continue

            try {
              const data = JSON.parse(jsonStr)

              if (data.event === "message" && data.answer) {
                hasReceivedContent = true
                const aiSDKChunk = `0:${JSON.stringify({ type: "text-delta", textDelta: data.answer })}\n`
                controller.enqueue(encoder.encode(aiSDKChunk))
              }

              if (data.event === "message_end" && data.metadata?.usage?.total_tokens) {
                totalTokens = data.metadata.usage.total_tokens
              }
            } catch {
              continue
            }
          }
        }

        const finishChunk = `0:${JSON.stringify({ type: "finish", finishReason: "stop" })}\n`
        controller.enqueue(encoder.encode(finishChunk))
        controller.close()

        if (hasReceivedContent && totalTokens > 0) {
          void deductCredit(userId, totalTokens, description).catch((error) => {
            console.error("[Billing] Deferred deduction failed:", error)
          })
        } else {
          console.warn(`[Billing] Skip charging, hasReceivedContent=${hasReceivedContent}, totalTokens=${totalTokens}`)
        }
      } catch (error) {
        controller.error(error)
      }
    },
  })

  return new Response(stream, {
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "text/plain; charset=utf-8",
      "X-Vercel-AI-Data-Stream": "v1",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}

export async function POST(req: Request) {
  try {
    assertSecureTlsConfiguration()

    const { getClientIP, checkIpRateLimit, checkUserRateLimit, createRateLimitResponse } = await import('@/lib/rate-limit')
    const ip = getClientIP(req)
    const ipLimitResult = checkIpRateLimit(ip)

    if (!ipLimitResult.allowed) {
      return createRateLimitResponse(ipLimitResult.retryAfter!)
    }

    const body = await req.json() as ChatRequestBody
    const { messages, files, extractedText, userId } = body

    if (!userId) {
      return new Response(JSON.stringify({ error: "未登录，无法使用" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }

    const userLimitResult = checkUserRateLimit(userId)
    if (!userLimitResult.allowed) {
      return createRateLimitResponse(userLimitResult.retryAfter!)
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: creditData, error: creditError } = await supabaseAdmin
      .from('user_credits')
      .select('credits')
      .eq('user_id', userId)
      .single()

    if (creditError) {
      console.error("[Billing] Credit lookup failed:", creditError)
      return new Response(JSON.stringify({ error: "账户积分信息查询失败" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (!creditData) {
      return new Response(JSON.stringify({ error: "账户未开通或无可用权限" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (creditData.credits < MIN_REQUIRED_CREDITS) {
      return new Response(JSON.stringify({
        error: `积分不足，至少需要 ${MIN_REQUIRED_CREDITS} 积分才能发起请求，当前剩余 ${creditData.credits} 积分。`,
      }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (extractedText && extractedText.length > 100) {
      const essayGradeResponse = await fetch(`${req.url.replace("/api/chat", "/api/essay-grade")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          essayText: extractedText,
          gradeLevel: "初中",
          topic: "作文批改",
          wordLimit: "800字",
        }),
      })

      if (!essayGradeResponse.ok) {
        const errorText = await essayGradeResponse.text()
        return new Response(JSON.stringify({ error: errorText || "Essay grading failed" }), {
          status: essayGradeResponse.status,
          headers: { "Content-Type": "application/json" },
        })
      }

      return createMeteredStreamResponse(essayGradeResponse, req, userId, "使用 作文批改")
    }

    const customConfig = getAPIConfig(req.headers.get("X-AI-Provider") || "openai")
    if (!customConfig) {
      return new Response(JSON.stringify({ error: "API configuration not found" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
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
      }

      if (index === messages.length - 1 && msg.role === "user" && files && files.length > 0) {
        const hasImages = files.some((file) => file.type.startsWith("image/"))
        if (hasImages) {
          const content: any[] = []
          if (textContent.trim()) {
            content.push({ type: "text", text: textContent })
          }

          for (const file of files) {
            if (file.type.startsWith("image/")) {
              content.push({ type: "image_url", image_url: { url: file.data } })
            }
          }

          return { role: msg.role, content }
        }

        let fileContext = ""
        for (const file of files) {
          if (file.type === "text/plain") {
            try {
              const base64Data = file.data.split(",")[1]
              const fileTextContent = Buffer.from(base64Data, "base64").toString("utf-8")
              fileContext += `\n\n[文件: ${file.name}]\n${fileTextContent}`
            } catch {}
          }
        }

        return { role: msg.role, content: textContent + fileContext }
      }

      return { role: msg.role, content: textContent }
    })

    const response = await fetch(`${customConfig.baseURL}/chat-messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customConfig.apiKey}`,
      },
      body: JSON.stringify({
        query: apiMessages[apiMessages.length - 1]?.content || "",
        conversation_id: "",
        response_mode: "streaming",
        user: userId,
        inputs: {},
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] API error:", response.status, errorText)
      return new Response(JSON.stringify({ error: `AI 服务暂时不可用: ${response.status}` }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      })
    }

    return createMeteredStreamResponse(response, req, userId, "使用 AI 对话")
  } catch (error) {
    console.error("[v0] Chat API error:", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
