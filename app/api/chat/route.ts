import { getAPIConfig } from "@/lib/ai-utils"
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60 // 作文批改比较慢，适当延长超时时间

// 💰 定价策略 (根据你的图片推导)
const COST_ESSAY = 250 // 作文批改：250 积分/次
const COST_CHAT = 20   // 普通对话：20 积分/次

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
    const { messages, files, extractedText, userId }: { messages: any[]; files?: any[]; extractedText?: string, userId?: string } = body

    // 判断是否为作文请求 (有提取的文本且长度大于 100)
    const isEssayRequest = extractedText && extractedText.length > 100
    
    // 确定本次操作的费用
    const currentCost = isEssayRequest ? COST_ESSAY : COST_CHAT

    // ==========================================
    // 🛑 第一关：安检 (检查积分)
    // ==========================================
    if (!userId) {
       console.warn("⚠️ 警告: 前端未传递 userId，无法扣费！(暂时放行，但在生产环境应拦截)")
       // return new Response(JSON.stringify({ error: "未登录，无法使用" }), { status: 401 }) 
    } 
    else {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // 查余额
      const { data: creditData, error: creditError } = await supabaseAdmin
        .from('user_credits')
        .select('credits')
        .eq('user_id', userId)
        .single()
      
      if (creditError || !creditData) {
         console.error("查询积分失败:", creditError)
      } else {
        console.log(`[Billing] 用户 ${userId} 当前积分: ${creditData.credits}, 本次需扣除: ${currentCost}`)
        
        // 核心判断：余额是否足够支付本次费用
        if (creditData.credits < currentCost) {
          return new Response(JSON.stringify({ 
            error: `积分不足！本次操作需要 ${currentCost} 积分，您当前仅剩 ${creditData.credits} 积分。请前往升级套餐。` 
          }), {
            status: 402, // Payment Required
            headers: { "Content-Type": "application/json" }
          })
        }
      }
    }
    // ==========================================

    // 定义扣费函数 (后续调用)
    const deductCredit = async () => {
      if (!userId) return
      try {
        const supabaseAdmin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const { data } = await supabaseAdmin.from('user_credits').select('credits').eq('user_id', userId).single()
        
        if (data) {
          // 确保不扣成负数
          const newCredits = Math.max(0, data.credits - currentCost)
          await supabaseAdmin
            .from('user_credits')
            .update({ credits: newCredits })
            .eq('user_id', userId)
          console.log(`[Billing] 扣费成功 (-${currentCost})，剩余: ${newCredits}`)
        }
      } catch (e) {
        console.error("[Billing] 扣费失败:", e)
      }
    }

    // --- 分支 A: 作文批改模式 ---
    if (isEssayRequest) {
      console.log("[v0] Triggering grading workflow...")

      try {
        // 调用专门的批改接口 (假设你已经有了这个接口)
        const essayGradeResponse = await fetch(`${req.url.replace("/api/chat", "/api/essay-grade")}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            essayText: extractedText,
            gradeLevel: "初中", // 这里可以根据用户输入动态调整
            topic: "作文批改",
            wordLimit: "800字",
          }),
        })

        if (!essayGradeResponse.ok) throw new Error("Essay grading failed")

        const essayResult = await essayGradeResponse.json()

        // ✅ 只有成功拿到结果才扣费 (良心商家)
        await deductCredit()

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

    // --- 分支 B: Dify 对话模式 ---
    const provider = req.headers.get("X-AI-Provider") || "openai"
    const modelName = req.headers.get("X-AI-Model") || "gpt-4o"
    const customConfig = getAPIConfig(provider)

    if (!customConfig) {
      return new Response(JSON.stringify({ error: "API configuration not found" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    }

    // 重新构建消息
    const apiMessages = messages.map((msg, index) => {
      let textContent = ""
      if (msg.parts && Array.isArray(msg.parts)) {
        textContent = msg.parts.filter((part: any) => part.type === "text").map((part: any) => part.text).join("\n")
      } else if (msg.content) {
         // 处理 Vercel AI SDK 不同版本的 content 格式
        if (Array.isArray(msg.content)) {
          textContent = msg.content.filter((part: any) => part.type === "text").map((part: any) => part.text).join("\n")
        } else if (typeof msg.content === "string") {
          textContent = msg.content
        } else {
          textContent = String(msg.content || "")
        }
      }

      // 文件处理逻辑 (保持原样)
      if (index === messages.length - 1 && msg.role === "user" && files && files.length > 0) {
         const hasImages = files.some((file) => file.type.startsWith("image/"))
         if (hasImages) {
             const content: any[] = []
             if (textContent.trim()) content.push({ type: "text", text: textContent })
             for (const file of files) {
                if (file.type.startsWith("image/")) {
                  content.push({ type: "image_url", image_url: { url: file.data } })
                }
             }
             return { role: msg.role, content: content }
         } else {
             let fileContext = ""
             for (const file of files) {
                if (file.type === "text/plain") {
                    try {
                        const base64Data = file.data.split(",")[1]
                        const fileTextContent = Buffer.from(base64Data, "base64").toString("utf-8")
                        fileContext += `\n\n[文件: ${file.name}]\n${fileTextContent}`
                    } catch(e) {}
                }
             }
             return { role: msg.role, content: textContent + fileContext }
         }
      }
      return { role: msg.role, content: textContent }
    })

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

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] API error:", response.status, errorText)
      return new Response(JSON.stringify({ error: `AI 服务暂时不可用: ${response.status}` }), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      })
    }

    // ✅ 普通对话开始流式传输前，执行扣费
    await deductCredit()

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader()
        if (!reader) {
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
                   }
                } catch (e) {}
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
      headers: { "Content-Type": "application/json" }
    })
  }
}