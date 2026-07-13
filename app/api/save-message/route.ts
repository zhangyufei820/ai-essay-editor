import { type NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createHash } from "crypto"
import { requireUser } from "@/lib/auth/verified-user"
import { sanitizeAssistantMessageForPublicDisplay } from "@/lib/chat-error-sanitizer"
import { isOperationTimeoutError, withTimeout } from "@/lib/server-timeout"

const AUTH_TIMEOUT_MS = 5_000
const SESSION_LOOKUP_TIMEOUT_MS = 4_000
const MESSAGE_INSERT_TIMEOUT_MS = 5_000
const FILE_METADATA_TIMEOUT_MS = 2_500

function createPersistenceDegradedResponse(code: string) {
  return NextResponse.json(
    {
      saved: false,
      degraded: true,
      code,
    },
    { status: 202 },
  )
}

function isTransientPersistenceError(error: unknown) {
  if (isOperationTimeoutError(error)) return true
  const message = error instanceof Error ? error.message : JSON.stringify(error)
  return /timeout|timed out|522|502|503|504|fetch failed|socket|statement timeout|upstream request timeout/i.test(message || "")
}

function resolveUploadedFileStorageUrl(file: Record<string, unknown>, fileData: string): string | null {
  const explicitUrl = file.storageUrl || file.storage_url || file.modelUrl || file.model_url || file.gatewayUrl || file.gateway_url
  if (typeof explicitUrl === "string" && explicitUrl.trim()) return explicitUrl.trim()

  const difyFileId = file.difyFileId || file.dify_file_id || file.id
  if (typeof difyFileId === "string" && difyFileId.trim()) return `dify-file://${difyFileId.trim()}`

  if (/^https?:\/\//i.test(fileData) || fileData.startsWith("/")) return fileData
  return null
}

function createInlineFileReference(file: Record<string, unknown>, fileData: string): string {
  const hash = createHash("sha256").update([
    String(file.name || "upload.bin"),
    String(file.type || "application/octet-stream"),
    String(file.size || 0),
    fileData.slice(0, 1024),
  ].join(":")).digest("hex").slice(0, 24)
  return `inline-file://${hash}`
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
      console.warn("[v0] Supabase not configured, refusing message save")
      return NextResponse.json({ error: "数据库未配置" }, { status: 503 })
    }

    const auth = await withTimeout(requireUser(request), AUTH_TIMEOUT_MS, "save-message.auth")
    if (auth.response) return auth.response
    const user = auth.user!

    const body = await request.json()
    const { session_id, role, content, files } = body
    if (!session_id || !role || typeof content !== "string") {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    const { data: session, error: sessionError } = await withTimeout(
      Promise.resolve(
        supabase
          .from("chat_sessions")
          .select("id,user_id")
          .eq("id", session_id)
          .maybeSingle(),
      ),
      SESSION_LOOKUP_TIMEOUT_MS,
      "save-message.session-lookup",
    )

    if (sessionError) throw sessionError
    if (!session) {
      return NextResponse.json({ error: "会话不存在" }, { status: 404 })
    }
    if (session.user_id !== user.id) {
      return NextResponse.json({ error: "无权访问该会话" }, { status: 403 })
    }

    const safeContent = role === "assistant"
      ? sanitizeAssistantMessageForPublicDisplay(content)
      : content

    const { data: message, error: messageError } = await withTimeout(
      Promise.resolve(
        supabase
          .from("chat_messages")
          .insert({
            session_id,
            role,
            content: safeContent,
          })
          .select()
          .single(),
      ),
      MESSAGE_INSERT_TIMEOUT_MS,
      "save-message.message-insert",
    )

    if (messageError) throw messageError

    // 保存文件
    if (Array.isArray(files) && files.length > 0) {
      void persistUploadedFileMetadata({
        files,
        supabase,
        userId: user.id,
        sessionId: session_id,
        messageId: message.id,
      }).catch((fileError) => {
        console.error("[v0] File metadata save background error:", fileError)
      })
    }

    return NextResponse.json({ message })
  } catch (error) {
    console.error("[v0] Save message error:", error)
    if (isTransientPersistenceError(error)) {
      return createPersistenceDegradedResponse(
        isOperationTimeoutError(error) ? error.code : "SAVE_MESSAGE_PERSISTENCE_DEGRADED",
      )
    }
    return NextResponse.json({ error: "保存消息失败" }, { status: 500 })
  }
}

function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function persistUploadedFileMetadata({
  files,
  supabase,
  userId,
  sessionId,
  messageId,
}: {
  files: unknown[]
  supabase: ReturnType<typeof createServiceRoleClient>
  userId: string
  sessionId: string
  messageId: string
}) {
  for (const file of files) {
    try {
      if (!file || typeof file !== "object") continue
      const record = file as Record<string, unknown>
      const fileData = typeof record.data === "string" ? record.data : ""

      const saveOne = async () => {
        const storageUrl = resolveUploadedFileStorageUrl(record, fileData)
          || (fileData ? createInlineFileReference(record, fileData) : null)

        if (!storageUrl) return

        await supabase.from("uploaded_files").insert({
          user_id: userId,
          session_id: sessionId,
          message_id: messageId,
          file_name: String(record.name || "upload.bin"),
          file_type: String(record.type || "application/octet-stream"),
          file_size: record.size || 0,
          storage_url: storageUrl,
        })
      }

      await withTimeout(saveOne(), FILE_METADATA_TIMEOUT_MS, "save-message.file-metadata")
    } catch (fileError) {
      console.error("[v0] File save error:", fileError)
    }
  }
}
