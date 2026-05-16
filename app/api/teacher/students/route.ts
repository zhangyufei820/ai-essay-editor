import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { isSupabaseUuid, requireLearningUserId } from "@/lib/learning-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

async function resolveStudentId(body: Record<string, unknown>) {
  const studentId = text(body.student_id)
  if (studentId) return isSupabaseUuid(studentId) ? studentId : null

  const email = text(body.student_email).toLowerCase()
  if (!email) return null

  const { data, error } = await getSupabaseAdmin().auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  return data.users.find((user) => user.email?.toLowerCase() === email)?.id || null
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response
    const teacherId = auth.userId!

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "请求体格式错误" }, { status: 400 })
    }

    const studentId = await resolveStudentId(body)
    if (!studentId) return NextResponse.json({ error: "找不到学生账号" }, { status: 404 })

    const { error } = await getSupabaseAdmin()
      .from("teacher_students")
      .upsert({
        teacher_id: teacherId,
        student_id: studentId,
        class_name: text(body.class_name) || null,
      }, { onConflict: "teacher_id,student_id", ignoreDuplicates: true })

    if (error) throw error
    return NextResponse.json({ success: true, student_id: studentId })
  } catch (error) {
    console.error("[TeacherStudents] bind failed:", error)
    const message = error instanceof Error && error.message === "缺少 Supabase 配置"
      ? "学生绑定服务未配置"
      : "绑定学生失败"
    return NextResponse.json({ error: message }, { status: message === "学生绑定服务未配置" ? 503 : 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response

    const supabase = getSupabaseAdmin()
    const { data: bindings, error } = await supabase
      .from("teacher_students")
      .select("student_id, class_name, joined_at")
      .eq("teacher_id", auth.userId!)
      .order("joined_at", { ascending: false })

    if (error) throw error

    const studentIds = (bindings || []).map((row) => row.student_id)
    const { data: progressRows } = studentIds.length
      ? await supabase
          .from("user_progress")
          .select("user_id, total_xp, level, current_streak, longest_streak, updated_at")
          .in("user_id", studentIds)
      : { data: [] }

    const progressByUser = new Map((progressRows || []).map((row) => [row.user_id, row]))
    return NextResponse.json({
      students: (bindings || []).map((binding) => ({
        student_id: binding.student_id,
        class_name: binding.class_name,
        joined_at: binding.joined_at,
        progress: progressByUser.get(binding.student_id) || null,
      })),
    })
  } catch (error) {
    console.error("[TeacherStudents] list failed:", error)
    const message = error instanceof Error && error.message === "缺少 Supabase 配置"
      ? "学生绑定服务未配置"
      : "获取学生列表失败"
    return NextResponse.json({ error: message }, { status: message === "学生绑定服务未配置" ? 503 : 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "请求体格式错误" }, { status: 400 })
    }

    const studentId = text(body.student_id)
    if (!isSupabaseUuid(studentId)) return NextResponse.json({ error: "student_id 参数无效" }, { status: 400 })

    const { error } = await getSupabaseAdmin()
      .from("teacher_students")
      .delete()
      .eq("teacher_id", auth.userId!)
      .eq("student_id", studentId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[TeacherStudents] unbind failed:", error)
    const message = error instanceof Error && error.message === "缺少 Supabase 配置"
      ? "学生绑定服务未配置"
      : "解绑学生失败"
    return NextResponse.json({ error: message }, { status: message === "学生绑定服务未配置" ? 503 : 500 })
  }
}
