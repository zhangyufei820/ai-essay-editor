"use client"

import {
  ButtonV2 as Button,
  CardV2 as Card,
  CardV2Content as CardContent,
  CardV2Header as CardHeader,
  CardV2Title as CardTitle,
  InputV2 as Input,
  LabelV2 as Label
} from "@/components/ui/v2"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import Link from "next/link"
import { Loader2, Plus, RefreshCw } from "lucide-react"
import { IconEssay, IconFolder } from "@/components/icons/v2"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"

const SUBJECTS = [
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

type UserFile = {
  id: string
  filename: string
  file_type: string
  file_size?: number | null
  storage_path: string
  mime_type?: string | null
  subject?: string | null
  status?: string | null
  created_at?: string | null
}

function subjectLabel(value?: string | null) {
  return SUBJECTS.find(([key]) => key === value)?.[1] || "未分类"
}

function formatSize(value?: number | null) {
  if (!value) return "未记录大小"
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export default function FolderPage() {
  const [files, setFiles] = useState<UserFile[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState({
    filename: "",
    file_type: "note",
    storage_path: "",
    subject: "other",
  })

  const grouped = useMemo(() => {
    return files.reduce<Record<string, UserFile[]>>((acc, file) => {
      const key = file.subject || "other"
      acc[key] = acc[key] || []
      acc[key].push(file)
      return acc
    }, {})
  }, [files])

  async function loadFiles() {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch("/api/user/folder", {
        headers: await getVerifiedAuthHeaders(),
        cache: "no-store",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || "资料夹暂不可用")
      setFiles(payload.files || [])
      setTotalCount(payload.total_count || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : "资料夹暂不可用")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFiles()
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.filename.trim()) {
      setMessage("请填写资料名称")
      return
    }

    try {
      setSubmitting(true)
      setMessage(null)
      const response = await fetch("/api/user/folder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getVerifiedAuthHeaders()),
        },
        body: JSON.stringify({
          filename: form.filename.trim(),
          file_type: form.file_type,
          file_size: 0,
          storage_path: form.storage_path.trim() || `manual://${Date.now()}-${encodeURIComponent(form.filename.trim())}`,
          subject: form.subject,
          mime_type: form.file_type === "link" ? "text/uri-list" : "text/plain",
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || "添加资料失败")
      setForm({ filename: "", file_type: "note", storage_path: "", subject: "other" })
      setMessage("资料已加入个人资料夹")
      await loadFiles()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "添加资料失败")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[var(--paper-50)] px-4 py-6 dark:bg-[var(--paper-50)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--ink-700)] dark:text-[var(--ink-200)]">个人资料夹</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal sm:text-3xl font-[var(--font-display)]">学习资料统一管理</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-500)]">
              保存课堂笔记、资料链接和学习文件记录，后续可用于生成闪卡、错题复习和教师查看。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadFiles}>
              <RefreshCw className="mr-2 size-4" />
              刷新
            </Button>
            <Button asChild>
              <Link href="/flashcards">生成闪卡</Link>
            </Button>
          </div>
        </header>

        {error ? (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <Card className="rounded-[var(--radius-sharp)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="size-5 text-[var(--ink-600)]" />
                添加资料
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="filename">资料名称</Label>
                  <Input
                    id="filename"
                    value={form.filename}
                    onChange={(event) => setForm((value) => ({ ...value, filename: event.target.value }))}
                    placeholder="例如：牛顿运动定律课堂笔记"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="file_type">类型</Label>
                    <select
                      id="file_type"
                      value={form.file_type}
                      onChange={(event) => setForm((value) => ({ ...value, file_type: event.target.value }))}
                      className="h-10 w-full rounded-[var(--radius-soft)] border border-input bg-[var(--paper-50)] px-3 text-sm"
                    >
                      <option value="note">笔记</option>
                      <option value="link">链接</option>
                      <option value="pdf">PDF</option>
                      <option value="image">图片</option>
                      <option value="other">其他</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subject">学科</Label>
                    <select
                      id="subject"
                      value={form.subject}
                      onChange={(event) => setForm((value) => ({ ...value, subject: event.target.value }))}
                      className="h-10 w-full rounded-[var(--radius-soft)] border border-input bg-[var(--paper-50)] px-3 text-sm"
                    >
                      {SUBJECTS.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storage_path">资料链接或位置</Label>
                  <Input
                    id="storage_path"
                    value={form.storage_path}
                    onChange={(event) => setForm((value) => ({ ...value, storage_path: event.target.value }))}
                    placeholder="可粘贴链接；留空则保存为手动记录"
                  />
                </div>
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  加入资料夹
                </Button>
                {message ? <p className="text-sm text-[var(--ink-500)]">{message}</p> : null}
              </form>
            </CardContent>
          </Card>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-[var(--ink-500)]">
                <IconFolder className="size-4" />
                共 {totalCount} 条资料
              </div>
            </div>

            {loading ? (
              <div className="grid gap-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-24 animate-pulse rounded-[var(--radius-sharp)] border bg-[var(--paper-100)]" />
                ))}
              </div>
            ) : files.length ? (
              <div className="space-y-5">
                {Object.entries(grouped).map(([subject, subjectFiles]) => (
                  <div key={subject} className="space-y-3">
                    <h2 className="text-sm font-semibold text-[var(--ink-500)] font-[var(--font-display)]">{subjectLabel(subject)}</h2>
                    <div className="grid gap-3 md:grid-cols-2">
                      {subjectFiles.map((file) => (
                        <Card key={file.id} className="rounded-[var(--radius-sharp)]">
                          <CardContent className="flex gap-3 py-4">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-soft)] bg-[var(--ink-50)] text-[var(--ink-700)] dark:bg-[var(--ink-900)]/50 dark:text-[var(--ink-200)]">
                              <IconEssay className="size-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">{file.filename}</div>
                              <div className="mt-1 text-xs text-[var(--ink-500)]">
                                {file.file_type} · {formatSize(file.file_size)} · {file.status || "uploaded"}
                              </div>
                              <div className="mt-2 truncate text-xs text-[var(--ink-500)]">{file.storage_path}</div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Card className="rounded-[var(--radius-sharp)]">
                <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                  <IconFolder className="size-10 text-[var(--ink-600)]" />
                  <div>
                    <h2 className="font-semibold font-[var(--font-display)]">资料夹还是空的</h2>
                    <p className="mt-1 text-sm text-[var(--ink-500)]">先添加一条笔记或资料链接，后续就能用于生成闪卡。</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
