import { NextResponse, type NextRequest } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { internalDifyFetch } from "@/lib/internal-dify-fetch"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DIFY_BASE_URL = (process.env.DIFY_INTERNAL_URL || process.env.DIFY_BASE_URL || "https://api.dify.ai/v1").replace(/\/+$/, "")

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function fireAndForget(label: string, promise: Promise<unknown>) {
  promise.catch((error) => console.error(`[AgentChat] ${label} failed:`, error))
}

async function updateAgentMetrics(params: {
  agentId: string
  totalConversations: number | null
  totalMessages: number | null
  hasConversationId: boolean
}) {
  await getSupabaseAdmin()
    .from("teacher_agents")
    .update({
      total_conversations: (params.totalConversations || 0) + (params.hasConversationId ? 0 : 1),
      total_messages: (params.totalMessages || 0) + 1,
    })
    .eq("id", params.agentId)
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request)
    if (auth.response) return auth.response

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "请求体格式错误" }, { status: 400 })
    }

    const message = text(body.message)
    const shareCode = text(body.agent_share_code)
    const conversationId = text(body.conversation_id)
    if (!message || !shareCode) {
      return NextResponse.json({ error: "message 和 agent_share_code 为必填项" }, { status: 400 })
    }

    const apiKey = process.env.DIFY_API_KEY_TEACHER_AGENT || ""
    if (!apiKey) {
      return NextResponse.json({ error: "教师智能体 Dify API Key 未配置" }, { status: 503 })
    }

    const supabase = getSupabaseAdmin()
    const { data: agent, error: agentError } = await supabase
      .from("teacher_agents")
      .select("id, system_prompt, total_conversations, total_messages")
      .eq("share_code", shareCode)
      .eq("status", "published")
      .maybeSingle()

    if (agentError) throw agentError
    if (!agent) {
      return NextResponse.json({ error: "智能体不存在或已下线" }, { status: 404 })
    }

    const response = await internalDifyFetch(`${DIFY_BASE_URL}/chat-messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        inputs: { custom_system_prompt: agent.system_prompt },
        query: message,
        response_mode: "streaming",
        conversation_id: conversationId,
        user: auth.user!.id,
      }),
    })

    if (!response.ok || !response.body) {
      const errorText = await response.text()
      console.error("[AgentChat] Dify failed:", response.status, errorText.slice(0, 500))
      return NextResponse.json({ error: "教师智能体暂时不可用" }, { status: 502 })
    }

    fireAndForget(
      "agent metrics update",
      updateAgentMetrics({
        agentId: agent.id,
        totalConversations: agent.total_conversations,
        totalMessages: agent.total_messages,
        hasConversationId: Boolean(conversationId),
      }),
    )

    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    console.error("[AgentChat] failed:", error)
    const message = error instanceof Error && error.message === "缺少 Supabase 配置"
      ? "教师智能体服务未配置"
      : "教师智能体对话失败"
    return NextResponse.json({ error: message }, { status: message === "教师智能体服务未配置" ? 503 : 500 })
  }
}
