import { createClient } from '@supabase/supabase-js'
import { type NextRequest } from "next/server"
import { getAPIConfig } from "@/lib/ai-utils"
import { requireUser } from "@/lib/auth/verified-user"
import {
  PRICING_VERSION,
  appendTextOutputLimitInstruction,
  calculateActualCost,
  getMaxOutputTokensForModel,
  getMinimumRequiredCredits,
  shouldAuditHighConsumptionTextCall,
  type ModelType,
} from '@/lib/pricing'
import { assertSecureTlsConfiguration } from '@/lib/runtime-security'
import { recordBillingIssue } from '@/lib/credits'
import {
  chargeCreditsSafely as spendCredits,
  createBillingLog as createBillingAuditMetadata,
  parseDifyUsage,
  type ParsedDifyUsage,
} from '@/lib/billing'

export const maxDuration = 60

const CHAT_MODEL: ModelType = "standard"
const MIN_REQUIRED_CREDITS = getMinimumRequiredCredits(CHAT_MODEL)
const CHAT_MAX_OUTPUT_TOKENS = getMaxOutputTokensForModel(CHAT_MODEL)

type ChatRequestBody = {
  messages: any[]
  files?: any[]
  extractedText?: string
  userId?: string
}

async function deductCredit(
  userId: string,
  usage: { totalTokens: number; promptTokens: number; completionTokens: number },
  description: string,
  parsedUsage?: ParsedDifyUsage | null,
) {
  const currentCost = calculateActualCost(
    CHAT_MODEL,
    {
      totalTokens: usage.totalTokens,
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
    },
    { hasOutputContent: true },
  )
  if (currentCost <= 0) {
    console.warn("[Billing] Skip charging because prompt/completion tokens are missing")
    return
  }

  const billingMetadata = createBillingAuditMetadata({
    userId,
    actionType: "consume",
    feature: "text",
    appId: "ESSAY_CORRECTION_API_KEY",
    workflowId: null,
    modelId: CHAT_MODEL,
    requestedAppId: "ESSAY_CORRECTION_API_KEY",
    requestedWorkflowId: null,
    requestedModelId: CHAT_MODEL,
    upstreamProvider: null,
    upstreamModel: null,
    upstreamGroup: null,
    upstreamRequestId: null,
    rawProviderMetadata: parsedUsage
      ? {
          usage: parsedUsage.rawUsage || null,
          finishReason: parsedUsage.finishReason || null,
          latency: parsedUsage.latency ?? null,
          timeToFirstToken: parsedUsage.timeToFirstToken ?? null,
          usageSource: parsedUsage.usageSource,
          estimated: parsedUsage.estimated,
          maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
        }
      : { maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS },
    usageSource: parsedUsage?.usageSource,
    estimated: parsedUsage?.estimated ?? false,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    chargedCredits: currentCost,
    rawUsageJson: parsedUsage?.rawUsage || null,
    finishReason: parsedUsage?.finishReason || null,
    latency: parsedUsage?.latency ?? null,
    timeToFirstToken: parsedUsage?.timeToFirstToken ?? null,
    description,
  })
  const chargeDescription = `${description} (输入 ${usage.promptTokens} tokens / 输出 ${usage.completionTokens} tokens)`
  if (shouldAuditHighConsumptionTextCall(CHAT_MODEL, usage.completionTokens, currentCost)) {
    console.warn("[Billing Audit] 高消耗文本调用:", {
      model: CHAT_MODEL,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      currentCost,
      maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
    })
  }
  const success = await spendCredits(
    userId,
    currentCost,
    "consume",
    chargeDescription,
    undefined,
    billingMetadata,
  )
  if (!success) {
    console.error("[Billing] Deferred deduction failed or insufficient credits")
    await recordBillingIssue(
      userId,
      currentCost,
      "billing_failed",
      `异常账单：${chargeDescription}`,
      undefined,
      billingMetadata,
    )
  }
}

function createMeteredStreamResponse(
  upstreamResponse: Response,
  userId: string,
  description: string
) {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let totalTokens = 0
  let promptTokens = 0
  let completionTokens = 0
  let hasReceivedContent = false
  let buffer = ""
  let latestParsedUsage: ParsedDifyUsage | null = null

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

              if (data.event === "message_end" && data.metadata?.usage) {
                const parsedUsage = parseDifyUsage(data)
                latestParsedUsage = parsedUsage
                totalTokens = parsedUsage.totalTokens
                promptTokens = parsedUsage.promptTokens
                completionTokens = parsedUsage.completionTokens
              }
            } catch {
              continue
            }
          }
        }

        const finishChunk = `0:${JSON.stringify({ type: "finish", finishReason: "stop" })}\n`
        controller.enqueue(encoder.encode(finishChunk))
        controller.close()

        if (hasReceivedContent && (promptTokens > 0 || completionTokens > 0)) {
          void deductCredit(userId, { totalTokens, promptTokens, completionTokens }, description, latestParsedUsage).catch((error) => {
            console.error("[Billing] Deferred deduction failed:", error)
          })
        } else {
          console.warn(`[Billing] Skip charging, hasReceivedContent=${hasReceivedContent}, promptTokens=${promptTokens}, completionTokens=${completionTokens}`)
        }
      } catch (error) {
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
    },
  })
}

export async function POST(req: NextRequest) {
  try {
    assertSecureTlsConfiguration()
    const auth = await requireUser(req)
    if (auth.response) return auth.response

    const { getClientIP, checkIpRateLimit, checkUserRateLimit, createRateLimitResponse } = await import('@/lib/rate-limit')
    const ip = getClientIP(req)
    const ipLimitResult = checkIpRateLimit(ip)

    if (!ipLimitResult.allowed) {
      return createRateLimitResponse(ipLimitResult.retryAfter!)
    }

    const body = await req.json() as ChatRequestBody
    const { messages, files, extractedText } = body
    const userId = auth.user!.id

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
        error: "当前积分不足",
        message: `当前功能至少需要 ${MIN_REQUIRED_CREDITS} 积分，当前剩余 ${creditData.credits} 积分。请充值或升级会员后继续使用。`,
        required: MIN_REQUIRED_CREDITS,
        current: creditData.credits,
        action: "请充值或升级会员",
      }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (extractedText && extractedText.length > 100) {
      const essayGradeResponse = await fetch(`${req.url.replace("/api/chat", "/api/essay-grade")}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(req.headers.get("authorization") ? { Authorization: req.headers.get("authorization")! } : {}),
          ...(req.headers.get("cookie") ? { Cookie: req.headers.get("cookie")! } : {}),
        },
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

      return createMeteredStreamResponse(essayGradeResponse, userId, "使用 作文批改")
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

    const lastMessageContent = apiMessages[apiMessages.length - 1]?.content
    const queryText = typeof lastMessageContent === "string" ? lastMessageContent : JSON.stringify(lastMessageContent || "")

    const response = await fetch(`${customConfig.baseURL}/chat-messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customConfig.apiKey}`,
      },
      body: JSON.stringify({
        query: appendTextOutputLimitInstruction(queryText, CHAT_MODEL),
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

    return createMeteredStreamResponse(response, userId, "使用 AI 对话")
  } catch (error) {
    console.error("[v0] Chat API error:", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
