import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { isSupabaseUuid, requireLearningUserId } from "@/lib/learning-user"
import { rejectUntrustedOrigin } from "@/lib/security/request"
import { signTeacherStudentInvite, verifyTeacherStudentInvite } from "@/lib/teacher-student-invite"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

export async function POST(request: NextRequest) {
  try {
    const originRejection = rejectUntrustedOrigin(request)
    if (originRejection) return originRejection

    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response
    const currentUserId = auth.userId!

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "请求体格式错误" }, { status: 400 })
    }

    const action = text(body.action)
    if (action === "create_invite") {
      const inviteCode = signTeacherStudentInvite({
        teacherId: currentUserId,
        className: text(body.class_name) || null,
      })
      if (!inviteCode) {
        return NextResponse.json({ error: "学生邀请服务未配置" }, { status: 503 })
      }
      return NextResponse.json({ success: true, invite_code: inviteCode, expires_in_seconds: 900 })
    }

    if (action !== "accept_invite") {
      return NextResponse.json({ error: "请使用有效邀请码完成学生授权" }, { status: 400 })
    }

    const invite = verifyTeacherStudentInvite(body.invite_code)
    if (!invite) return NextResponse.json({ error: "邀请码无效或已过期" }, { status: 400 })
    if (invite.teacherId === currentUserId) {
      return NextResponse.json({ error: "不能绑定自己的账号" }, { status: 400 })
    }

    const { error } = await getSupabaseAdmin()
      .from("teacher_students")
      .upsert({
        teacher_id: invite.teacherId,
        student_id: currentUserId,
        class_name: invite.className,
        student_consented_at: new Date().toISOString(),
      }, { onConflict: "teacher_id,student_id" })

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[TeacherStudents] invite action failed:", error)
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
    const [studentBindingsResult, teacherBindingsResult] = await Promise.all([
      supabase
        .from("teacher_students")
        .select("student_id, class_name, joined_at, student_consented_at")
        .eq("teacher_id", auth.userId!)
        .not("student_consented_at", "is", null)
        .order("joined_at", { ascending: false }),
      supabase
        .from("teacher_students")
        .select("teacher_id, class_name, joined_at, student_consented_at")
        .eq("student_id", auth.userId!)
        .not("student_consented_at", "is", null)
        .order("joined_at", { ascending: false }),
    ])

    if (studentBindingsResult.error) throw studentBindingsResult.error
    if (teacherBindingsResult.error) throw teacherBindingsResult.error

    const bindings = studentBindingsResult.data || []

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
      teachers: teacherBindingsResult.data || [],
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
    const originRejection = rejectUntrustedOrigin(request)
    if (originRejection) return originRejection

    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "请求体格式错误" }, { status: 400 })
    }

    const studentId = text(body.student_id)
    const teacherId = text(body.teacher_id)
    const removesStudent = isSupabaseUuid(studentId) && !teacherId
    const revokesTeacher = isSupabaseUuid(teacherId) && !studentId
    if (!removesStudent && !revokesTeacher) {
      return NextResponse.json({ error: "解绑参数无效" }, { status: 400 })
    }

    let query = getSupabaseAdmin()
      .from("teacher_students")
      .delete()
      .not("student_consented_at", "is", null)

    query = removesStudent
      ? query.eq("teacher_id", auth.userId!).eq("student_id", studentId)
      : query.eq("teacher_id", teacherId).eq("student_id", auth.userId!)

    const { error } = await query

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
