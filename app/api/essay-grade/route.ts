import { type NextRequest, NextResponse } from "next/server"

export const maxDuration = 60

const MODELS = {
  gpt: "openai/gpt-5",
  claude: "anthropic/claude-4.1-opus",
  gemini: "google/gemini-3-pro-preview",
}

export async function POST(req: NextRequest) {
  console.log("[v0] ===== Essay grading API called =====")

  try {
    const body = await req.json()
    const { essayText, gradeLevel, topic, wordLimit, studentName, genre, background } = body

    console.log("[v0] Request received:", {
      hasText: !!essayText,
      textLength: essayText?.length,
      gradeLevel,
      topic,
    })

    if (!essayText) {
      console.log("[v0] No essay text provided")
      return NextResponse.json({ error: "请提供作文内容" }, { status: 400 })
    }

    const testResult = `## 📝 作文批改报告（测试版本）

### 基本信息
- 题目：${topic || "作文"}
- 字数：${essayText?.length || 0} 字
- 年级：${gradeLevel || "未指定"}

### 测试说明
**API 路由工作正常！**

如果您看到这条消息，说明：
1. ✅ 前端成功调用了 API
2. ✅ API 路由正确接收了请求
3. ✅ API 能够返回结果

接下来我们将添加 AI 模型调用。

---
*这是一个测试响应，用于确认 API 基础功能*`

    console.log("[v0] Returning test result")

    return NextResponse.json(
      {
        result: testResult,
        extractedText: essayText,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      },
    )

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
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  })
}
