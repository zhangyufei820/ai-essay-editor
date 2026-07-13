import { NextResponse, type NextRequest } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { checkIpRateLimit, createRateLimitResponse, getClientIP } from "@/lib/rate-limit"
import { callToolsDifyChat } from "@/lib/tools-dify-client"
import { rejectUntrustedOrigin } from "@/lib/security/request"

export const maxDuration = 60

const MAX_SEARCH_QUERY_LENGTH = 500
const TAVILY_TIMEOUT_MS = 15_000

type SearchResult = {
  title: string
  url: string
  snippet: string
  source: string
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

async function searchWithTavily(query: string, maxResults: number): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return []

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    signal: AbortSignal.timeout(TAVILY_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: maxResults,
      search_depth: "basic",
      include_answer: false,
      include_raw_content: false,
    }),
  })

  if (!response.ok) {
    throw new Error(`Tavily 搜索失败：${response.status}`)
  }

  const payload = await response.json() as { results?: Array<Record<string, unknown>> }
  return (payload.results || []).map((item) => ({
    title: readString(item.title) || "未命名结果",
    url: readString(item.url),
    snippet: readString(item.content),
    source: "search",
  })).filter((item) => item.url)
}

async function searchWithDify(query: string, maxResults: number): Promise<SearchResult[]> {
  const apiKey = process.env.DIFY_WEB_SEARCH_API_KEY || ""
  if (!apiKey) return []

  const result = await callToolsDifyChat({
    apiKey,
    query: `请联网搜索并整理 ${maxResults} 条与“${query}”相关的可靠网页结果。返回 Markdown 列表，每条包含标题、链接和摘要。`,
    inputs: { query, maxResults, tool: "web-search" },
    user: "tools-web-search",
  })

  if (!result.ok) return []

  return [{
    title: `联网搜索整理：${query}`,
    url: "",
    snippet: result.content,
    source: "search",
  }]
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

    const { query, maxResults = 5 } = await req.json()
    const cleanQuery = typeof query === "string" ? query.trim() : ""
    const limit = Math.min(Math.max(Number(maxResults) || 5, 1), 10)

    if (!cleanQuery) {
      return NextResponse.json({ error: "查询内容不能为空" }, { status: 400 })
    }
    if (cleanQuery.length > MAX_SEARCH_QUERY_LENGTH) {
      return NextResponse.json({ error: "查询内容不能超过 500 个字符" }, { status: 413 })
    }

    const results = await searchWithTavily(cleanQuery, limit)
    const finalResults = results.length ? results : await searchWithDify(cleanQuery, limit)

    if (!finalResults.length) {
      return NextResponse.json(
        {
          error: "网页搜索服务暂时不可用，请稍后重试。",
          code: "WEB_SEARCH_NOT_CONFIGURED",
        },
        { status: 501 },
      )
    }

    return NextResponse.json({
      success: true,
      query: cleanQuery,
      engine: "server",
      results: finalResults,
    })
  } catch (error) {
    console.error("[Tools Web Search] error:", error)
    return NextResponse.json(
      { error: "网页搜索失败，请稍后重试。" },
      { status: 500 },
    )
  }
}
