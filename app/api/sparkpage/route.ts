import { generateText } from "ai"
import { NextResponse } from "next/server"

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const { query, searchResults, documents, provider = "openai", model = "gpt-5" } = await req.json()

    if (!query) {
      return NextResponse.json({ error: "查询内容不能为空" }, { status: 400 })
    }

    // 构建综合提示词
    const prompt = buildSparkpagePrompt(query, searchResults, documents)

    // 使用LLM生成结构化内容
    const { text } = await generateText({
      model: `${provider}/${model}`,
      prompt,
      maxOutputTokens: 8000,
      temperature: 0.7,
    })

    // 解析生成的内容为结构化格式
    const sparkpage = parseSparkpageContent(text)

    return NextResponse.json({
      success: true,
      sparkpage,
    })
  } catch (error) {
    console.error("[v0] Sparkpage generation error:", error)
    return NextResponse.json({ error: "Sparkpage生成失败" }, { status: 500 })
  }
}

function buildSparkpagePrompt(query: string, searchResults?: unknown[], documents?: unknown[]): string {
  let prompt = `作为一个专业的内容综合分析师，请根据以下信息创建一个结构化的Sparkpage：

用户查询: ${query}

`

  if (searchResults && searchResults.length > 0) {
    prompt += `\n搜索结果:\n${JSON.stringify(searchResults, null, 2)}\n`
  }

  if (documents && documents.length > 0) {
    prompt += `\n文档内容:\n${JSON.stringify(documents, null, 2)}\n`
  }

  prompt += `
请生成一个包含以下部分的综合分析：
1. 执行摘要 (Executive Summary)
2. 关键发现 (Key Findings)
3. 详细分析 (Detailed Analysis)
4. 数据可视化建议 (Data Visualization Suggestions)
5. 结论与建议 (Conclusions & Recommendations)
6. 相关资源 (Related Resources)

请以JSON格式返回，包含title, sections数组，每个section有heading和content。
`

  return prompt
}

function parseSparkpageContent(text: string) {
  try {
    // 尝试解析JSON
    return JSON.parse(text)
  } catch {
    // 如果不是JSON，返回基本结构
    return {
      title: "分析报告",
      sections: [
        {
          heading: "内容",
          content: text,
        },
      ],
    }
  }
}
