import { type NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"
import { requireUser } from "@/lib/auth/verified-user"
import { sanitizeAssistantMessageForPublicDisplay } from "@/lib/chat-error-sanitizer"
import { isOperationTimeoutError, withTimeout } from "@/lib/server-timeout"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DIFY_CONVERSATION_COLUMN = "dify_conversation_id"
const SESSION_LIST_FIELDS = `id,title,preview,ai_model,${DIFY_CONVERSATION_COLUMN},created_at`
const SESSION_DETAIL_FIELDS = `id,title,preview,ai_model,${DIFY_CONVERSATION_COLUMN},user_id,created_at`
const SESSION_LIST_FIELDS_LEGACY = "id,title,preview,ai_model,created_at"
const SESSION_DETAIL_FIELDS_LEGACY = "id,title,preview,ai_model,user_id,created_at"
const AUTH_TIMEOUT_MS = 5_000
const SESSION_LOOKUP_TIMEOUT_MS = 4_000
const SESSION_WRITE_TIMEOUT_MS = 5_000
const SESSION_LIST_TIMEOUT_MS = 4_000
const SESSION_MESSAGES_TIMEOUT_MS = 5_000

function isMissingDifyConversationColumn(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "42703",
  )
}

function toPublicChatMessage(message: Record<string, unknown>) {
  if (message.role !== "assistant") return message
  return {
    ...message,
    content: sanitizeAssistantMessageForPublicDisplay(message.content),
  }
}

function isTransientSessionPersistenceError(error: unknown) {
  if (isOperationTimeoutError(error)) return true
  const message = error instanceof Error ? error.message : JSON.stringify(error)
  return /timeout|timed out|522|502|503|504|fetch failed|socket|statement timeout|upstream request timeout/i.test(message || "")
}

function createDegradedSessionResponse({
  sessionId,
  title,
  preview,
  aiModel,
  difyConversationId,
}: {
  sessionId: string
  title: string
  preview: string | null
  aiModel: unknown
  difyConversationId: string | null
}) {
  return NextResponse.json(
    {
      session: {
        id: sessionId,
        title,
        preview,
        ai_model: aiModel,
        ...(difyConversationId ? { [DIFY_CONVERSATION_COLUMN]: difyConversationId } : {}),
      },
      saved: false,
      degraded: true,
      code: "SESSION_PERSISTENCE_DEGRADED",
    },
    { status: 202 },
  )
}

export async function POST(request: NextRequest) {
  try {
    // IP 限流：30次/分钟
    const { getClientIP, checkIpRateLimit, createRateLimitResponse } = await import('@/lib/rate-limit')
    const ip = getClientIP(request)
    const limitResult = checkIpRateLimit(ip, 30)
    if (!limitResult.allowed) {
      return createRateLimitResponse(limitResult.retryAfter!)
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "数据库未配置" }, { status: 503 })
    }

    const auth = await withTimeout(requireUser(request), AUTH_TIMEOUT_MS, "chat-session.auth")
    if (auth.response) return auth.response
    const user = auth.user!

    const body = await request.json()
    const { id, title, preview, ai_model, dify_conversation_id } = body
    const difyConversationId = typeof dify_conversation_id === "string" && dify_conversation_id.trim()
      ? dify_conversation_id.trim()
      : null
    const requestedId = typeof id === "string" && id.trim() ? id.trim() : null
    const effectiveSessionId = requestedId || randomUUID()
    const effectiveTitle = title || "新对话"
    const effectivePreview = preview || null
    if (requestedId && !UUID_RE.test(requestedId)) {
      return NextResponse.json({ error: "会话 ID 格式无效" }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    if (requestedId) {
      const existingResult = await withTimeout(
        Promise.resolve(
          supabase
            .from("chat_sessions")
            .select("id,user_id")
            .eq("id", requestedId)
            .maybeSingle(),
        ),
        SESSION_LOOKUP_TIMEOUT_MS,
        "chat-session.existing-lookup",
      ).catch((error) => ({ data: null, error }))

      const { data: existing, error: existingError } = existingResult

      if (existingError) {
        if (isOperationTimeoutError(existingError)) {
          console.warn("[v0] Session lookup degraded:", existingError)
          return createDegradedSessionResponse({
            sessionId: effectiveSessionId,
            title: effectiveTitle,
            preview: effectivePreview,
            aiModel: ai_model,
            difyConversationId,
          })
        }
        throw existingError
      }
      if (existing && existing.user_id !== user.id) {
        return NextResponse.json({ error: "无权访问该会话" }, { status: 403 })
      }
      if (existing) {
        const updatePayload = {
          title: effectiveTitle,
          preview: effectivePreview,
          ai_model,
          ...(difyConversationId ? { [DIFY_CONVERSATION_COLUMN]: difyConversationId } : {}),
        }
        let { data: session, error } = await withTimeout(
          Promise.resolve(
            supabase
              .from("chat_sessions")
              .update(updatePayload)
              .eq("id", requestedId)
              .eq("user_id", user.id)
              .select()
              .single(),
          ),
          SESSION_WRITE_TIMEOUT_MS,
          "chat-session.update",
        )

        if (error && difyConversationId && isMissingDifyConversationColumn(error)) {
          const fallback = await withTimeout(
            Promise.resolve(
              supabase
                .from("chat_sessions")
                .update({
                  title: updatePayload.title,
                  preview: updatePayload.preview,
                  ai_model: updatePayload.ai_model,
                })
                .eq("id", requestedId)
                .eq("user_id", user.id)
                .select()
                .single(),
            ),
            SESSION_WRITE_TIMEOUT_MS,
            "chat-session.update-legacy",
          )
          session = fallback.data
          error = fallback.error
        }

        if (error) throw error
        return NextResponse.json({ session })
      }
    }

    const insertPayload = {
      id: effectiveSessionId,
      user_id: user.id,
      title: effectiveTitle,
      preview: effectivePreview,
      ai_model,
      ...(difyConversationId ? { [DIFY_CONVERSATION_COLUMN]: difyConversationId } : {}),
    }
    let { data: session, error } = await withTimeout(
      Promise.resolve(
        supabase
          .from("chat_sessions")
          .insert(insertPayload)
          .select()
          .single(),
      ),
      SESSION_WRITE_TIMEOUT_MS,
      "chat-session.insert",
    )

    if (error && difyConversationId && isMissingDifyConversationColumn(error)) {
      const fallback = await withTimeout(
        Promise.resolve(
          supabase
            .from("chat_sessions")
            .insert({
              id: insertPayload.id,
              user_id: user.id,
              title: effectiveTitle,
              preview: effectivePreview,
              ai_model,
            })
            .select()
            .single(),
        ),
        SESSION_WRITE_TIMEOUT_MS,
        "chat-session.insert-legacy",
      )
      session = fallback.data
      error = fallback.error
    }

    if (error) throw error

    return NextResponse.json({ session })
  } catch (error) {
    console.error("[v0] Create session error:", error)
    if (isTransientSessionPersistenceError(error)) {
      return NextResponse.json(
        {
          error: "会话保存已降级，当前对话仍可继续",
          saved: false,
          degraded: true,
          code: isOperationTimeoutError(error) ? error.code : "SESSION_PERSISTENCE_DEGRADED",
        },
        { status: 202 },
      )
    }
    return NextResponse.json({ error: "创建会话失败" }, { status: 500 })
  }
}

// 🔥 创建使用 Service Role Key 的 Supabase 客户端（绕过 RLS）
function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ sessions: [] }, { status: 200 })
    }

    const auth = await withTimeout(requireUser(request), AUTH_TIMEOUT_MS, "chat-session.auth")
    if (auth.response) return auth.response
    const user = auth.user!
    const sessionId = request.nextUrl.searchParams.get("sessionId")?.trim()
    const limitParam = Number(request.nextUrl.searchParams.get("limit") || 30)
    const limit = Number.isFinite(limitParam) ? Math.min(50, Math.max(1, Math.round(limitParam))) : 30

    const supabase = createServiceRoleClient()
    if (sessionId) {
      let { data: session, error: sessionError }: { data: Record<string, unknown> | null; error: unknown } = await withTimeout(
        Promise.resolve(
          supabase
            .from("chat_sessions")
            .select(SESSION_DETAIL_FIELDS)
            .eq("id", sessionId)
            .maybeSingle(),
        ),
        SESSION_LOOKUP_TIMEOUT_MS,
        "chat-session.detail",
      )

      if (sessionError && isMissingDifyConversationColumn(sessionError)) {
        const fallback = await withTimeout(
          Promise.resolve(
            supabase
              .from("chat_sessions")
              .select(SESSION_DETAIL_FIELDS_LEGACY)
              .eq("id", sessionId)
              .maybeSingle(),
          ),
          SESSION_LOOKUP_TIMEOUT_MS,
          "chat-session.detail-legacy",
        )
        session = fallback.data
        sessionError = fallback.error
      }

      if (sessionError) throw sessionError
      if (!session) return NextResponse.json({ error: "会话不存在" }, { status: 404 })
      if (session.user_id !== user.id) {
        return NextResponse.json({ error: "无权访问该会话" }, { status: 403 })
      }

      const { data: messages, error: messagesError } = await withTimeout(
        Promise.resolve(
          supabase
            .from("chat_messages")
            .select("id,role,content,created_at")
            .eq("session_id", sessionId)
            .order("created_at", { ascending: true }),
        ),
        SESSION_MESSAGES_TIMEOUT_MS,
        "chat-session.messages",
      )

      if (messagesError) throw messagesError
      const { user_id: _userId, ...safeSession } = session
      return NextResponse.json({ session: safeSession, messages: (messages || []).map(toPublicChatMessage) })
    }

    let { data: sessions, error }: { data: Array<Record<string, unknown>> | null; error: unknown } = await withTimeout(
      Promise.resolve(
        supabase
          .from("chat_sessions")
          .select(SESSION_LIST_FIELDS)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(limit),
      ),
      SESSION_LIST_TIMEOUT_MS,
      "chat-session.list",
    )

    if (error && isMissingDifyConversationColumn(error)) {
      const fallback = await withTimeout(
        Promise.resolve(
          supabase
            .from("chat_sessions")
            .select(SESSION_LIST_FIELDS_LEGACY)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(limit),
        ),
        SESSION_LIST_TIMEOUT_MS,
        "chat-session.list-legacy",
      )
      sessions = fallback.data
      error = fallback.error
    }

    if (error) throw error

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error("[v0] Get sessions error:", error)
    if (isTransientSessionPersistenceError(error)) {
      return NextResponse.json(
        {
          sessions: [],
          degraded: true,
          code: isOperationTimeoutError(error) ? error.code : "SESSION_READ_DEGRADED",
        },
        { status: 200 },
      )
    }
    return NextResponse.json({ sessions: [], degraded: true }, { status: 200 })
  }
}
