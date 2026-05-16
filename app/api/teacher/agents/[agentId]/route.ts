import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireLearningUserId } from "@/lib/learning-user"
import {
  generateSystemPrompt,
  normalizeTeacherAgentStyle,
  normalizeTeacherAgentTemplate,
} from "@/lib/teacher-agent-templates"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function normalizeTopics(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 20)
  if (typeof value === "string" && value.trim()) return value.trim()
  return undefined
}

async function loadOwnedAgent(agentId: string, teacherId: string) {
  return getSupabaseAdmin()
    .from("teacher_agents")
    .select("*")
    .eq("id", agentId)
    .eq("teacher_id", teacherId)
    .maybeSingle()
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ agentId: string }> | { agentId: string } },
) {
  try {
    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response

    const { agentId } = await context.params
    const { data, error } = await loadOwnedAgent(agentId, auth.userId!)
    if (error) throw error
    if (!data) return NextResponse.json({ error: "智能体不存在" }, { status: 404 })
    return NextResponse.json({ agent: data })
  } catch (error) {
    console.error("[TeacherAgent] get failed:", error)
    const message = error instanceof Error && error.message === "缺少 Supabase 配置"
      ? "教师智能体服务未配置"
      : "获取教师智能体失败"
    return NextResponse.json({ error: message }, { status: message === "教师智能体服务未配置" ? 503 : 500 })
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ agentId: string }> | { agentId: string } },
) {
  try {
    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response

    const { agentId } = await context.params
    const { data: existing, error: loadError } = await loadOwnedAgent(agentId, auth.userId!)
    if (loadError) throw loadError
    if (!existing) return NextResponse.json({ error: "智能体不存在" }, { status: 404 })

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "请求体格式错误" }, { status: 400 })
    }

    const template = body.template === undefined
      ? existing.template
      : normalizeTeacherAgentTemplate(body.template)
    if (!template) return NextResponse.json({ error: "template 参数无效" }, { status: 400 })

    const subject = body.subject === undefined ? existing.subject : text(body.subject) || null
    const grade = body.grade === undefined ? existing.grade : text(body.grade) || null
    const style = body.style === undefined ? existing.style : normalizeTeacherAgentStyle(body.style)
    const topics = normalizeTopics(body.topics)
    const shouldRegeneratePrompt = ["template", "style", "subject", "grade", "topics", "custom_prompt"]
      .some((key) => Object.prototype.hasOwnProperty.call(body, key))

    const patch: Record<string, unknown> = {
      subject,
      grade,
      template,
      style,
    }

    if (body.name !== undefined) patch.name = text(body.name) || existing.name
    if (body.description !== undefined) patch.description = text(body.description) || null
    if (body.is_public !== undefined) patch.is_public = body.is_public === true
    if (shouldRegeneratePrompt) {
      patch.system_prompt = generateSystemPrompt(template, {
        subject,
        grade,
        style,
        topics,
        custom_prompt: text(body.custom_prompt) || existing.system_prompt,
      })
    }

    const { data, error } = await getSupabaseAdmin()
      .from("teacher_agents")
      .update(patch)
      .eq("id", agentId)
      .eq("teacher_id", auth.userId!)
      .select("*")
      .single()

    if (error) throw error
    return NextResponse.json({ agent: data })
  } catch (error) {
    console.error("[TeacherAgent] update failed:", error)
    const message = error instanceof Error && error.message === "缺少 Supabase 配置"
      ? "教师智能体服务未配置"
      : "更新教师智能体失败"
    return NextResponse.json({ error: message }, { status: message === "教师智能体服务未配置" ? 503 : 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ agentId: string }> | { agentId: string } },
) {
  try {
    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response

    const { agentId } = await context.params
    const { error } = await getSupabaseAdmin()
      .from("teacher_agents")
      .update({ status: "archived" })
      .eq("id", agentId)
      .eq("teacher_id", auth.userId!)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[TeacherAgent] delete failed:", error)
    const message = error instanceof Error && error.message === "缺少 Supabase 配置"
      ? "教师智能体服务未配置"
      : "删除教师智能体失败"
    return NextResponse.json({ error: message }, { status: message === "教师智能体服务未配置" ? 503 : 500 })
  }
}
