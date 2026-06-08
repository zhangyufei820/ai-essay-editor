import { type NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createHash } from "crypto"
import { requireUser } from "@/lib/auth/verified-user"
import { isCosConfigured } from "@/lib/cos"
import { uploadBase64File } from "@/lib/storage"

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

    const auth = await requireUser(request)
    if (auth.response) return auth.response
    const user = auth.user!

    const body = await request.json()
    const { session_id, role, content, files } = body
    if (!session_id || !role || typeof content !== "string") {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    const { data: session, error: sessionError } = await supabase
      .from("chat_sessions")
      .select("id,user_id")
      .eq("id", session_id)
      .maybeSingle()

    if (sessionError) throw sessionError
    if (!session) {
      return NextResponse.json({ error: "会话不存在" }, { status: 404 })
    }
    if (session.user_id !== user.id) {
      return NextResponse.json({ error: "无权访问该会话" }, { status: 403 })
    }

    const { data: message, error: messageError } = await supabase
      .from("chat_messages")
      .insert({
        session_id,
        role,
        content,
      })
      .select()
      .single()

    if (messageError) throw messageError

    // 保存文件
    if (files && files.length > 0) {
      for (const file of files) {
        try {
          if (!file || typeof file !== "object") continue
          const fileData = typeof file.data === "string" ? file.data : ""

          const storageUrl = resolveUploadedFileStorageUrl(file, fileData)
            || (fileData
              ? isCosConfigured()
                ? await uploadBase64File(fileData, String(file.name || "upload.bin"), String(file.type || "application/octet-stream"), user.id)
                : createInlineFileReference(file, fileData)
              : null)

          if (!storageUrl) continue

          // 保存文件元数据
          await supabase.from("uploaded_files").insert({
            user_id: user.id,
            session_id,
            message_id: message.id,
            file_name: String(file.name || "upload.bin"),
            file_type: String(file.type || "application/octet-stream"),
            file_size: file.size || 0,
            storage_url: storageUrl,
          })
        } catch (fileError) {
          console.error("[v0] File save error:", fileError)
          // 继续处理其他文件
        }
      }
    }

    return NextResponse.json({ message })
  } catch (error) {
    console.error("[v0] Save message error:", error)
    return NextResponse.json({ error: "保存消息失败" }, { status: 500 })
  }
}

function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
