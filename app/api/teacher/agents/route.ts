import { randomUUID } from "crypto"
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


function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeTopics(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 20)
  if (typeof value === "string" && value.trim()) return value.trim()
  return null
}

async function createShareCode() {
  const supabase = getSupabaseAdmin()
  for (let index = 0; index < 5; index += 1) {
    const code = randomUUID().replace(/-/g, "").slice(0, 8)
    const { data } = await supabase.from("teacher_agents").select("id").eq("share_code", code).maybeSingle()
    if (!data) return code
  }
  return randomUUID().replace(/-/g, "").slice(0, 12)
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

    const name = text(body.name)
    const template = normalizeTeacherAgentTemplate(body.template)
    if (!name || !template) {
      return NextResponse.json({ error: "name 和 template 为必填项" }, { status: 400 })
    }

    const subject = optionalText(body.subject)
    const grade = optionalText(body.grade)
    const style = normalizeTeacherAgentStyle(body.style)
    const topics = normalizeTopics(body.topics)
    const systemPrompt = generateSystemPrompt(template, {
      subject,
      grade,
      style,
      topics,
      custom_prompt: optionalText(body.custom_prompt),
    })
    const shareCode = await createShareCode()

    const { data, error } = await getSupabaseAdmin()
      .from("teacher_agents")
      .insert({
        teacher_id: teacherId,
        name,
        description: optionalText(body.description),
        subject,
        grade,
        template,
        system_prompt: systemPrompt,
        style,
        share_code: shareCode,
        status: "published",
        is_public: body.is_public === false ? false : true,
        published_at: new Date().toISOString(),
      })
      .select("id, share_code")
      .single()

    if (error) throw error

    return NextResponse.json({
      agent_id: data.id,
      share_code: data.share_code,
      share_url: `/chat?agent=${data.share_code}`,
    }, { status: 201 })
  } catch (error) {
    console.error("[TeacherAgents] create failed:", error)
    const message = error instanceof Error && error.message === "缺少 Supabase 配置"
      ? "教师智能体服务未配置"
      : "创建教师智能体失败"
    return NextResponse.json({ error: message }, { status: message === "教师智能体服务未配置" ? 503 : 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireLearningUserId(request)
    if (auth.response) return auth.response

    const { data, error } = await getSupabaseAdmin()
      .from("teacher_agents")
      .select("*")
      .eq("teacher_id", auth.userId!)
      .neq("status", "archived")
      .order("created_at", { ascending: false })

    if (error) throw error
    return NextResponse.json({ agents: data || [] })
  } catch (error) {
    console.error("[TeacherAgents] list failed:", error)
    const message = error instanceof Error && error.message === "缺少 Supabase 配置"
      ? "教师智能体服务未配置"
      : "获取教师智能体失败"
    return NextResponse.json({ error: message }, { status: message === "教师智能体服务未配置" ? 503 : 500 })
  }
}
