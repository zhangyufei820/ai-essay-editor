import { generateText } from "ai"
import { createOpenAI, openai } from "@ai-sdk/openai"
import { NextResponse, type NextRequest } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { checkIpRateLimit, createRateLimitResponse, getClientIP } from "@/lib/rate-limit"
import { callToolsDifyChat } from "@/lib/tools-dify-client"
import { rejectUntrustedOrigin } from "@/lib/security/request"

export const maxDuration = 90

const MAX_SPARK_QUERY_LENGTH = 2_000
const MAX_CONTEXT_ITEMS = 20
const MAX_CONTEXT_JSON_LENGTH = 100_000

const xaiProvider = createOpenAI({
  name: "xai",
  baseURL: process.env.XAI_BASE_URL || "https://api.x.ai/v1",
  apiKey: process.env.XAI_API_KEY || process.env.OPENAI_API_KEY || "",
})

function resolveLanguageModel(provider: string, modelName: string) {
  if (provider === "xai") return xaiProvider(modelName)
  return openai(modelName)
}

function buildSparkpagePrompt(query: string, searchResults?: unknown[], documents?: unknown[]): string {
  let prompt = `作为一个专业的内容综合分析师，请根据以下信息创建一个结构化综合报告。

用户查询: ${query}
`

  if (Array.isArray(searchResults) && searchResults.length > 0) {
    prompt += `\n搜索结果:\n${JSON.stringify(searchResults, null, 2)}\n`
  }

  if (Array.isArray(documents) && documents.length > 0) {
    prompt += `\n文档内容:\n${JSON.stringify(documents, null, 2)}\n`
  }

  prompt += `
请生成 JSON，字段如下：
{
  "title": "报告标题",
  "sections": [
    { "heading": "执行摘要", "content": "..." },
    { "heading": "关键发现", "content": "..." },
    { "heading": "详细分析", "content": "..." },
    { "heading": "行动建议", "content": "..." },
    { "heading": "相关资源", "content": "..." }
  ]
}
不要编造无法确认的链接。`

  return prompt
}

function parseSparkpageContent(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    return {
      title: "综合报告",
      sections: [
        {
          heading: "内容",
          content: text,
        },
      ],
    }
  }
}

async function generateSparkpage(input: {
  query: string
  searchResults?: unknown[]
  documents?: unknown[]
}) {
  const prompt = buildSparkpagePrompt(input.query, input.searchResults, input.documents)
  const difyKey = process.env.DIFY_SPARKPAGE_API_KEY || ""

  if (difyKey) {
    const dify = await callToolsDifyChat({
      apiKey: difyKey,
      query: prompt,
      inputs: {
        query: input.query,
        searchResults: input.searchResults || [],
        documents: input.documents || [],
        tool: "sparkpage",
      },
      user: "tools-sparkpage",
    })

    if (dify.ok) {
      return { engine: "server", sparkpage: parseSparkpageContent(dify.content) }
    }
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("综合报告服务暂时不可用，请稍后重试。")
  }

  const { text } = await generateText({
    model: resolveLanguageModel(
      process.env.TOOLS_SPARKPAGE_PROVIDER === "xai" ? "xai" : "openai",
      process.env.TOOLS_SPARKPAGE_MODEL || "gpt-5-mini",
    ) as any,
    prompt,
    maxTokens: 6000,
    temperature: 0.5,
  })

  return { engine: "server", sparkpage: parseSparkpageContent(text) }
}

export async function POST(req: NextRequest) {
  try {
    const originRejection = rejectUntrustedOrigin(req)
    if (originRejection) return originRejection

    const auth = await requireUser(req)
    if (auth.response) return auth.response

    const ip = getClientIP(req)
    const limitResult = checkIpRateLimit(ip, 30)
    if (!limitResult.allowed) {
      return createRateLimitResponse(limitResult.retryAfter!)
    }

    const { query, searchResults, documents } = await req.json()
    const cleanQuery = typeof query === "string" ? query.trim() : ""

    if (!cleanQuery) {
      return NextResponse.json({ error: "查询内容不能为空" }, { status: 400 })
    }
    if (cleanQuery.length > MAX_SPARK_QUERY_LENGTH) {
      return NextResponse.json({ error: "查询内容不能超过 2000 个字符" }, { status: 413 })
    }
    const contextItems = [searchResults, documents].filter(Array.isArray) as unknown[][]
    if (
      contextItems.some((items) => items.length > MAX_CONTEXT_ITEMS) ||
      contextItems.some((items) => JSON.stringify(items).length > MAX_CONTEXT_JSON_LENGTH)
    ) {
      return NextResponse.json({ error: "附加资料过多，请精简后重试" }, { status: 413 })
    }

    const result = await generateSparkpage({
      query: cleanQuery,
      searchResults: Array.isArray(searchResults) ? searchResults : undefined,
      documents: Array.isArray(documents) ? documents : undefined,
    })

    return NextResponse.json({
      success: true,
      engine: result.engine,
      sparkpage: result.sparkpage,
    })
  } catch (error) {
    console.error("[Tools Sparkpage] error:", error)
    return NextResponse.json(
      { error: "综合报告生成失败，请稍后重试。" },
      { status: 500 },
    )
  }
}
