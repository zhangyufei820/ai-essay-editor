"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, BookOpenCheck, FileText, Loader2, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"

type StudentFolderData = {
  files: Array<{
    id: string
    filename: string
    file_type: string
    file_size?: number | null
    storage_path?: string | null
    subject?: string | null
    created_at?: string | null
  }>
  progress: {
    total_xp?: number
    level?: number
    current_streak?: number
    longest_streak?: number
    total_sessions?: number
    total_study_minutes?: number
  } | null
  recent_sessions: Array<{
    id: string
    session_type?: string | null
    subject?: string | null
    topic?: string | null
    duration_seconds?: number | null
    xp_earned?: number | null
    started_at?: string | null
  }>
  active_mistakes: Array<{
    id: string
    subject?: string | null
    topic?: string | null
    question?: string | null
    created_at?: string | null
  }>
}

function formatDate(value?: string | null) {
  if (!value) return "未记录"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function formatMinutes(seconds?: number | null) {
  if (!seconds) return "0 分钟"
  return `${Math.max(1, Math.ceil(seconds / 60))} 分钟`
}

export default function TeacherStudentDetailPage() {
  const params = useParams<{ studentId: string }>()
  const studentId = params.studentId
  const [data, setData] = useState<StudentFolderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`/api/admin/user-folder/${studentId}`, {
          headers: await getVerifiedAuthHeaders(),
          cache: "no-store",
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload?.error || "无法查看学生资料")
        if (!cancelled) setData(payload)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "无法查看学生资料")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (studentId) loadData()
    return () => {
      cancelled = true
    }
  }, [studentId])

  return (
    <main className="min-h-screen bg-[#f7faf7] px-4 py-6 dark:bg-background sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-3">
          <Button asChild variant="ghost" className="w-fit px-0">
            <Link href="/teacher/agents">
              <ArrowLeft className="mr-2 size-4" />
              返回教师平台
            </Link>
          </Button>
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">学生学习档案</p>
            <h1 className="mt-1 break-all text-2xl font-semibold tracking-normal sm:text-3xl">{studentId}</h1>
            <p className="mt-2 text-sm text-muted-foreground">查看已绑定学生的学习进度、资料夹、最近学习记录和未掌握错题。</p>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在加载学生资料...
          </div>
        ) : error ? (
          <Card className="border-destructive/40">
            <CardContent className="flex items-center gap-2 py-5 text-sm text-destructive">
              <TriangleAlert className="size-4" />
              {error}
            </CardContent>
          </Card>
        ) : data ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <Card className="rounded-xl"><CardContent className="py-5"><div className="text-2xl font-semibold">{data.progress?.level || 1}</div><div className="text-sm text-muted-foreground">等级</div></CardContent></Card>
              <Card className="rounded-xl"><CardContent className="py-5"><div className="text-2xl font-semibold">{data.progress?.total_xp || 0}</div><div className="text-sm text-muted-foreground">XP</div></CardContent></Card>
              <Card className="rounded-xl"><CardContent className="py-5"><div className="text-2xl font-semibold">{data.progress?.current_streak || 0}</div><div className="text-sm text-muted-foreground">连续打卡</div></CardContent></Card>
              <Card className="rounded-xl"><CardContent className="py-5"><div className="text-2xl font-semibold">{data.progress?.total_sessions || 0}</div><div className="text-sm text-muted-foreground">学习会话</div></CardContent></Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="size-5 text-emerald-600" />
                    资料夹
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.files.length ? data.files.map((file) => (
                    <div key={file.id} className="rounded-lg border border-border/70 p-3">
                      <div className="font-medium">{file.filename}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{file.file_type} · {file.subject || "未分类"} · {formatDate(file.created_at)}</div>
                      {file.storage_path ? <div className="mt-2 truncate text-xs text-muted-foreground">{file.storage_path}</div> : null}
                    </div>
                  )) : <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">暂无资料</div>}
                </CardContent>
              </Card>

              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BookOpenCheck className="size-5 text-emerald-600" />
                    最近学习
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.recent_sessions.length ? data.recent_sessions.map((session) => (
                    <div key={session.id} className="rounded-lg border border-border/70 p-3">
                      <div className="font-medium">{session.session_type || "学习"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{session.subject || "综合"} · {formatMinutes(session.duration_seconds)} · +{session.xp_earned || 0} XP</div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatDate(session.started_at)}</div>
                    </div>
                  )) : <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">暂无学习记录</div>}
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle className="text-base">未掌握错题</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {data.active_mistakes.length ? data.active_mistakes.map((mistake) => (
                  <div key={mistake.id} className="rounded-lg border border-border/70 p-3">
                    <div className="text-sm font-medium">{mistake.subject || "综合"} · {mistake.topic || "未分类"}</div>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{mistake.question || "未记录题目"}</p>
                  </div>
                )) : <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground md:col-span-2">暂无未掌握错题</div>}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </main>
  )
}
