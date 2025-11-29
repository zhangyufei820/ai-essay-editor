import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { uploadBase64File } from "@/lib/storage"

export async function POST(request: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.log("[v0] Supabase not configured, skipping message save")
      return NextResponse.json({ message: { id: Date.now().toString() } }, { status: 200 })
    }

    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 })
    }

    const body = await request.json()
    const { session_id, role, content, files } = body

    // 保存消息
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

    // 更新会话的updated_at
    await supabase.from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", session_id)

    return NextResponse.json({ message })
  } catch (error) {
    console.error("[v0] Save message error:", error)
    return NextResponse.json({ error: "保存消息失败" }, { status: 500 })
  }
}
