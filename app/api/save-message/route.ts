import { type NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { requireUser } from "@/lib/auth/verified-user"
import { uploadBase64File } from "@/lib/storage"

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

    // 生产 chat_messages 表目前没有 metadata 列，历史幂等信息先由前端去重保护。
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
          // 上传文件到Vercel Blob
          const storageUrl = await uploadBase64File(file.data, file.name, file.type, user.id)

          // 保存文件元数据
          await supabase.from("uploaded_files").insert({
            user_id: user.id,
            session_id,
            message_id: message.id,
            file_name: file.name,
            file_type: file.type,
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
