"use client"

import {
  ButtonV2 as Button,
  CardV2 as Card,
  CardV2Content as CardContent,
  CardV2Header as CardHeader,
  CardV2Title as CardTitle,
  InputV2 as Input,
  LabelV2 as Label,
  TextareaV2 as Textarea
} from "@/components/ui/v2"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import Link from "next/link"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"
import { IconAllInOne, IconBanzhuren, IconCopy, IconHistory, IconShare } from "@/components/icons/v2"

const TEMPLATES = [
  { value: "essay_review", label: "作文批改", description: "总评、打分、逐段批注和升格建议" },
  { value: "quiz_master", label: "出题专家", description: "一问一答、解析、难度递进" },
  { value: "english_partner", label: "英语伙伴", description: "英语对话、生词注释和语法纠正" },
  { value: "tutor", label: "知识辅导", description: "苏格拉底式引导和知识点验证" },
  { value: "custom", label: "自定义 Prompt", description: "教师完全自由创作智能体规则" },
] as const

const STYLES = [
  ["balanced", "均衡"],
  ["strict", "严谨"],
  ["humorous", "幽默"],
  ["socratic", "提问引导"],
] as const

const SUBJECTS = [
  ["chinese", "语文"],
  ["math", "数学"],
  ["english", "英语"],
  ["physics", "物理"],
  ["chemistry", "化学"],
  ["biology", "生物"],
  ["history", "历史"],
  ["geography", "地理"],
  ["politics", "政治"],
  ["other", "其他"],
] as const

type TeacherAgent = {
  id: string
  name: string
  description?: string | null
  subject?: string | null
  grade?: string | null
  template: string
  style?: string | null
  share_code?: string | null
  status?: string | null
  total_conversations?: number | null
  total_messages?: number | null
  created_at?: string | null
}

type Student = {
  student_id: string
  class_name?: string | null
  joined_at?: string | null
  progress?: {
    total_xp?: number
    level?: number
    current_streak?: number
    longest_streak?: number
  } | null
}

function templateLabel(value: string) {
  return TEMPLATES.find((item) => item.value === value)?.label || value
}

function subjectLabel(value?: string | null) {
  return SUBJECTS.find(([key]) => key === value)?.[1] || "综合"
}

export default function TeacherAgentsPage() {
  const [agents, setAgents] = useState<TeacherAgent[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [studentSubmitting, setStudentSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: "",
    description: "",
    template: "essay_review",
    subject: "chinese",
    grade: "初中",
    style: "balanced",
    topics: "",
    custom_prompt: "",
  })
  const [studentForm, setStudentForm] = useState({
    student_email: "",
    student_id: "",
    class_name: "",
  })

  const selectedTemplate = useMemo(
    () => TEMPLATES.find((item) => item.value === form.template) || TEMPLATES[0],
    [form.template],
  )

  async function loadData() {
    try {
      setLoading(true)
      setError(null)
      const headers = await getVerifiedAuthHeaders()
      const [agentsResponse, studentsResponse] = await Promise.all([
        fetch("/api/teacher/agents", { headers, cache: "no-store" }),
        fetch("/api/teacher/students", { headers, cache: "no-store" }),
      ])
      const agentsPayload = await agentsResponse.json().catch(() => ({}))
      const studentsPayload = await studentsResponse.json().catch(() => ({}))
      if (!agentsResponse.ok) throw new Error(agentsPayload?.error || "教师智能体暂不可用")
      if (!studentsResponse.ok) throw new Error(studentsPayload?.error || "学生管理暂不可用")
      setAgents(agentsPayload.agents || [])
      setStudents(studentsPayload.students || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "教师平台暂不可用")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.name.trim()) {
      setMessage("请填写智能体名称")
      return
    }

    try {
      setSubmitting(true)
      setMessage(null)
      const response = await fetch("/api/teacher/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getVerifiedAuthHeaders()),
        },
        body: JSON.stringify(form),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || "创建智能体失败")
      setMessage(`已创建智能体，分享码：${payload.share_code}`)
      setForm((value) => ({ ...value, name: "", description: "", topics: "", custom_prompt: "" }))
      await loadData()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "创建智能体失败")
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteAgent(agentId: string) {
    if (!window.confirm("确定归档这个智能体吗？")) return
    const response = await fetch(`/api/teacher/agents/${agentId}`, {
      method: "DELETE",
      headers: await getVerifiedAuthHeaders(),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setMessage(payload?.error || "归档失败")
      return
    }
    setMessage("智能体已归档")
    await loadData()
  }

  async function bindStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!studentForm.student_email.trim() && !studentForm.student_id.trim()) {
      setMessage("请填写学生邮箱或 Supabase 用户 ID")
      return
    }
    try {
      setStudentSubmitting(true)
      setMessage(null)
      const response = await fetch("/api/teacher/students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getVerifiedAuthHeaders()),
        },
        body: JSON.stringify(studentForm),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || "绑定学生失败")
      setStudentForm({ student_email: "", student_id: "", class_name: "" })
      setMessage("学生已绑定")
      await loadData()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "绑定学生失败")
    } finally {
      setStudentSubmitting(false)
    }
  }

  async function unbindStudent(studentId: string) {
    const response = await fetch("/api/teacher/students", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(await getVerifiedAuthHeaders()),
      },
      body: JSON.stringify({ student_id: studentId }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setMessage(payload?.error || "解绑失败")
      return
    }
    setMessage("学生已解绑")
    await loadData()
  }

  function copyShare(code?: string | null) {
    if (!code) return
    const url = `${window.location.origin}/chat?agent=${code}`
    navigator.clipboard?.writeText(url)
    setMessage("分享链接已复制")
  }

  return (
    <main className="min-h-screen bg-[var(--paper-50)] px-4 py-6 dark:bg-[var(--paper-50)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--ink-700)] dark:text-[var(--ink-200)]">教师平台</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal sm:text-3xl font-[var(--font-display)]">自主创建 AI 智能体</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-500)]">
              使用四大模板或自定义 Prompt 创建教学智能体，一键生成分享码，并绑定学生查看学习进度和资料夹。
            </p>
          </div>
          <Button variant="outline" onClick={loadData}>
            <IconHistory className="mr-2 size-4" />
            刷新
          </Button>
        </header>

        {error ? (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}
        {message ? (
          <Card>
            <CardContent className="py-4 text-sm text-[var(--ink-500)]">{message}</CardContent>
          </Card>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <Card className="rounded-[var(--radius-sharp)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="size-5 text-[var(--ink-600)]" />
                创建智能体
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={createAgent}>
                <div className="space-y-2">
                  <Label htmlFor="agent-name">名称</Label>
                  <Input id="agent-name" value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} placeholder="例如：初二作文升格教练" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template">模板</Label>
                  <select id="template" value={form.template} onChange={(event) => setForm((value) => ({ ...value, template: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-[var(--paper-50)] px-3 text-sm">
                    {TEMPLATES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                  <p className="text-xs text-[var(--ink-500)]">{selectedTemplate.description}</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="subject">学科</Label>
                    <select id="subject" value={form.subject} onChange={(event) => setForm((value) => ({ ...value, subject: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-[var(--paper-50)] px-3 text-sm">
                      {SUBJECTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="grade">年级</Label>
                    <Input id="grade" value={form.grade} onChange={(event) => setForm((value) => ({ ...value, grade: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="style">风格</Label>
                    <select id="style" value={form.style} onChange={(event) => setForm((value) => ({ ...value, style: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-[var(--paper-50)] px-3 text-sm">
                      {STYLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="topics">主题范围</Label>
                  <Input id="topics" value={form.topics} onChange={(event) => setForm((value) => ({ ...value, topics: event.target.value }))} placeholder="例如：记叙文细节描写、一次函数、一般过去时" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">说明</Label>
                  <Input id="description" value={form.description} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} placeholder="给学生看的简短说明" />
                </div>
                {form.template === "custom" ? (
                  <div className="space-y-2">
                    <Label htmlFor="custom-prompt">自定义 Prompt</Label>
                    <Textarea id="custom-prompt" value={form.custom_prompt} onChange={(event) => setForm((value) => ({ ...value, custom_prompt: event.target.value }))} rows={6} placeholder="写下这个智能体要如何教学、如何提问、如何反馈..." />
                  </div>
                ) : null}
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  创建并生成分享码
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-[var(--radius-sharp)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <IconAllInOne className="size-5 text-[var(--ink-600)]" />
                  我的智能体
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-[var(--radius-sharp)] bg-[var(--paper-100)]" />)}
                  </div>
                ) : agents.length ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {agents.map((agent) => (
                      <Card key={agent.id} className="rounded-[var(--radius-sharp)] border-[var(--paper-200)]/70">
                        <CardContent className="space-y-3 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold">{agent.name}</div>
                              <div className="mt-1 text-xs text-[var(--ink-500)]">{templateLabel(agent.template)} · {subjectLabel(agent.subject)} · {agent.grade || "中学"}</div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => deleteAgent(agent.id)} aria-label="归档智能体">
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                          {agent.description ? <p className="text-sm text-[var(--ink-500)]">{agent.description}</p> : null}
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-500)]">
                            <IconShare className="size-4" />
                            <span>share_code: {agent.share_code}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => copyShare(agent.share_code)}>
                              <IconCopy className="mr-2 size-4" />
                              复制链接
                            </Button>
                            <Button size="sm" asChild>
                              <Link href={`/chat?agent=${agent.share_code || ""}`}>打开对话</Link>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[var(--radius-sharp)] border border-dashed py-12 text-center text-sm text-[var(--ink-500)]">还没有智能体，先创建一个给学生使用。</div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[var(--radius-sharp)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <IconBanzhuren className="size-5 text-[var(--ink-600)]" />
                  学生绑定与进度
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <form className="grid gap-3 md:grid-cols-[1fr_1fr_140px_auto]" onSubmit={bindStudent}>
                  <Input value={studentForm.student_email} onChange={(event) => setStudentForm((value) => ({ ...value, student_email: event.target.value }))} placeholder="学生邮箱" />
                  <Input value={studentForm.student_id} onChange={(event) => setStudentForm((value) => ({ ...value, student_id: event.target.value }))} placeholder="或学生 UUID" />
                  <Input value={studentForm.class_name} onChange={(event) => setStudentForm((value) => ({ ...value, class_name: event.target.value }))} placeholder="班级" />
                  <Button type="submit" disabled={studentSubmitting}>
                    {studentSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    绑定
                  </Button>
                </form>

                {students.length ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {students.map((student) => (
                      <Card key={student.student_id} className="rounded-[var(--radius-sharp)] border-[var(--paper-200)]/70">
                        <CardContent className="space-y-3 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-medium">{student.student_id}</div>
                              <div className="mt-1 text-xs text-[var(--ink-500)]">{student.class_name || "未分班"}</div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => unbindStudent(student.student_id)}>解绑</Button>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center text-sm">
                            <div className="rounded-[var(--radius-soft)] bg-[var(--paper-100)]/50 p-2"><div className="font-semibold">{student.progress?.level || 1}</div><div className="text-xs text-[var(--ink-500)]">等级</div></div>
                            <div className="rounded-[var(--radius-soft)] bg-[var(--paper-100)]/50 p-2"><div className="font-semibold">{student.progress?.total_xp || 0}</div><div className="text-xs text-[var(--ink-500)]">XP</div></div>
                            <div className="rounded-[var(--radius-soft)] bg-[var(--paper-100)]/50 p-2"><div className="font-semibold">{student.progress?.current_streak || 0}</div><div className="text-xs text-[var(--ink-500)]">连续</div></div>
                          </div>
                          <Button asChild size="sm" variant="outline" className="w-full">
                            <Link href={`/teacher/students/${student.student_id}`}>查看进度和资料夹</Link>
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[var(--radius-sharp)] border border-dashed py-10 text-center text-sm text-[var(--ink-500)]">还没有绑定学生。</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  )
}
