import { type NextRequest, NextResponse } from "next/server"
import { getCorsHeaders, handleOptions } from '@/lib/cors'

export const maxDuration = 60

// 使用专门的作文批改环境变量
const ESSAY_CORRECTION_API_KEY = process.env.ESSAY_CORRECTION_API_KEY
const ESSAY_CORRECTION_BASE_URL = process.env.ESSAY_CORRECTION_BASE_URL

export async function POST(req: NextRequest) {
  console.log("[作文批改] ===== API 调用开始 =====")

  try {
    // ==========================================
    // 限流检查
    // ==========================================
    const { getClientIP, checkIpRateLimit, createRateLimitResponse } = await import('@/lib/rate-limit')
    const ip = getClientIP(req)
    
    // IP 限流检查
    const ipLimitResult = checkIpRateLimit(ip)
    if (!ipLimitResult.allowed) {
      return createRateLimitResponse(ipLimitResult.retryAfter!)
    }
    
    const body = await req.json()
    const { essayText, gradeLevel, topic, wordLimit, studentName, genre, background, fileIds } = body

    console.log("[作文批改] 请求参数:", {
      hasText: !!essayText,
      textLength: essayText?.length,
      gradeLevel,
      topic,
      fileCount: fileIds?.length || 0
    })

    if (!essayText && (!fileIds || fileIds.length === 0)) {
      console.log("[作文批改] 缺少作文内容")
      return NextResponse.json({ error: "请提供作文内容或上传作文图片" }, { status: 400 })
    }

    // 检查是否配置了作文批改环境变量
    if (!ESSAY_CORRECTION_API_KEY || !ESSAY_CORRECTION_BASE_URL) {
      console.error("[作文批改] API配置缺失")
      return NextResponse.json(
        { error: "作文批改服务未配置" },
        { status: 500 }
      )
    }

    console.log("[作文批改] 使用服务:", ESSAY_CORRECTION_BASE_URL)

    // 🔥 构建请求体 - 支持文件上传
    const difyRequest: any = {
      inputs: {
        gradeLevel: gradeLevel || "初中",
        topic: topic || "作文",
        wordLimit: wordLimit || "800字",
        studentName: studentName || "学生",
        genre: genre || "记叙文",
        background: background || "课外习作"
      },
      query: essayText || "请批改上传的作文图片",
      response_mode: "streaming", // 🔥 改为流式响应，支持思考过程显示
      user: "essay-correction-user"
    }

    // 🔥 添加文件支持
    if (fileIds && fileIds.length > 0) {
      difyRequest.files = fileIds.map((id: string) => ({
        type: 'image',
        transfer_method: 'local_file',
        upload_file_id: id
      }))
      console.log("[作文批改] 包含文件:", fileIds.length)
    }

    try {
      // 🔥 调用作文批改 API - 流式响应
      const response = await fetch(`${ESSAY_CORRECTION_BASE_URL}/chat-messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ESSAY_CORRECTION_API_KEY}`
        },
        body: JSON.stringify(difyRequest)
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("[作文批改] API错误:", response.status, errorText)
        throw new Error(`API 错误: ${response.status} ${errorText}`)
      }

      console.log("[作文批改] 开始流式传输...")

      // 🔥 创建 TransformStream 处理思考过程
      const transformStream = new TransformStream({
        async transform(chunk, controller) {
          // 直接传递数据给前端
          controller.enqueue(chunk)
          
          // 解析并记录思考过程
          try {
            const text = new TextDecoder().decode(chunk)
            const lines = text.split("\n")
            
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue
              const data = line.slice(6).trim()
              if (data === "[DONE]") continue
              
              try {
                const json = JSON.parse(data)
                
                // 🔥 记录思考过程（如果后端支持）
                if (json.event === "agent_thought" || json.event === "workflow_started") {
                  console.log("[作文批改] 思考过程:", json.thought || json.data)
                }
                
                // 记录文本输出
                if (json.event === "message" && json.answer) {
                  console.log("[作文批改] 输出文本片段:", json.answer.substring(0, 50))
                }
              } catch {}
            }
          } catch {}
        }
      })

      // 🔥 返回流式响应
      return new Response(response.body?.pipeThrough(transformStream), {
        headers: { 
          ...getCorsHeaders(req),
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        }
      })
    } catch (apiError) {
      console.error("[作文批改] API调用失败:", apiError)
      throw apiError
    }

    // const prompt = `请作为专业语文教师，对以下作文进行批改：

    // **学生信息**：
    // - 姓名：${studentName || "学生"}
    // - 年级：${gradeLevel || "初中七年级"}
    // - 题目：《${topic || "作文"}》
    // - 字数要求：${wordLimit || "600-800字"}
    // - 文体：${genre || "记叙文"}
    // - 写作背景：${background || "课外习作"}

    // **原始作文**：
    // ${essayText}

    // 请按照以下格式输出完整批改报告：

    // ## 📝 作文批改报告

    // ### 一、原文识别呈现
    // [识别并整理学生作文内容]

    // ### 二、规范性全面诊断
    // **年级适配性分析**：
    // - 现状：
    // - 问题：
    // - 评估：

    // **题目要求符合度**：60%
    // - 问题：
    //   1.
    //   2.
    //   3.

    // **字数控制检查**：
    // - 要求：${wordLimit || "600-800字"}
    // - 实际：约XXX字
    // - 问题：
    // - 需要：

    // **文体规范性**：
    // 1.
    // 2.
    // 3.
    // 4.

    // ### 三、结构深度诊断

    // **起承转合分析**：
    // - 起（开头）：
    // - 承（主体）：
    // - 转（转折）：
    // - 合（结尾）：

    // **结构问题总结**：
    // 1.
    // 2.
    // 3.
    // 4.

    // ### 四、分层进阶润色
    // [提供3个版本的润色建议]

    // ### 五、最终定稿
    // [提供优化后的完整作文]

    // ### 六、学习要点总结
    // 1.
    // 2.
    // 3.
    // 4.
    // 5.

    // 期待您的回复！😊`

    // const result = await generateText({
    //   model: "anthropic/claude-sonnet-4",
    //   system: ESSAY_GRADING_SYSTEM_PROMPT,
    //   prompt: prompt,
    //   temperature: 0.7,
    //   maxTokens: 8000,
    // })

    // console.log("[v0] Claude response received, length:", result.text?.length)

    // if (!result.text) {
    //   console.log("[v0] Empty response from Claude")
    //   throw new Error("未收到批改结果")
    // }

    // console.log("[v0] Essay grading completed successfully")

    // return NextResponse.json(
    //   {
    //     result: result.text,
    //     extractedText: essayText,
    //   },
    //   {
    //     headers: {
    //       "Access-Control-Allow-Origin": "*",
    //     },
    //   },
    // )
  } catch (error) {
    console.error("[v0] Essay grading error:", error)
    const errorMessage = error instanceof Error ? error.message : "未知错误"
    const errorStack = error instanceof Error ? error.stack : ""
    console.log("[v0] Error details:", errorMessage)
    console.log("[v0] Error stack:", errorStack)

    return NextResponse.json(
      {
        error: "批改失败，请稍后重试",
        details: errorMessage,
      },
      { status: 500 },
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req)
}
