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
import { useState, type FormEvent } from "react"
import Link from "next/link"
import { FileText, Loader2, Presentation, Search, Sparkles, Wand2 } from "lucide-react"

type ToolResult = {
  title: string
  content: unknown
}

function JsonBlock({ value }: { value: unknown }) {
  if (typeof value === "string") {
    return <div className="whitespace-pre-wrap rounded-[var(--radius-soft)] bg-[var(--paper-100)]/50 p-3 text-sm leading-6">{value}</div>
  }

  return (
    <pre className="max-h-96 overflow-auto rounded-[var(--radius-soft)] bg-[var(--paper-100)]/50 p-3 text-xs leading-5">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

export default function ToolsPage() {
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<ToolResult | null>(null)
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [ocrImages, setOcrImages] = useState("")
  const [presentationContent, setPresentationContent] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [sparkQuery, setSparkQuery] = useState("")

  async function runDocumentProcess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!documentFile) {
      setResult({ title: "文档处理", content: "请先选择文件" })
      return
    }

    try {
      setBusy("document")
      const formData = new FormData()
      formData.append("file", documentFile)
      const response = await fetch("/api/document-process", { method: "POST", body: formData })
      const payload = await response.json().catch(() => ({}))
      setResult({ title: "文档处理结果", content: response.ok ? payload : payload.error || "文档处理失败" })
    } finally {
      setBusy(null)
    }
  }

  async function runOcr(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const images = ocrImages.split(/\n+/).map((value) => value.trim()).filter(Boolean)
    if (!images.length) {
      setResult({ title: "图片 OCR", content: "请粘贴至少一个图片 URL" })
      return
    }

    try {
      setBusy("ocr")
      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      })
      const payload = await response.json().catch(() => ({}))
      setResult({ title: "OCR 识别结果", content: response.ok ? payload.text || payload : payload.error || "OCR 失败" })
    } finally {
      setBusy(null)
    }
  }

  async function runPresentation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!presentationContent.trim()) {
      setResult({ title: "演示文稿", content: "请填写演示内容" })
      return
    }

    try {
      setBusy("presentation")
      const response = await fetch("/api/presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: presentationContent, template: "classroom" }),
      })
      const payload = await response.json().catch(() => ({}))
      setResult({ title: "演示文稿结果", content: response.ok ? payload.presentation || payload : payload.error || "生成失败" })
    } finally {
      setBusy(null)
    }
  }

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!searchQuery.trim()) {
      setResult({ title: "网页搜索", content: "请填写搜索问题" })
      return
    }

    try {
      setBusy("search")
      const response = await fetch("/api/web-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, maxResults: 5 }),
      })
      const payload = await response.json().catch(() => ({}))
      setResult({ title: "网页搜索结果", content: response.ok ? payload.results || payload : payload.error || "搜索失败" })
    } finally {
      setBusy(null)
    }
  }

  async function runSparkpage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sparkQuery.trim()) {
      setResult({ title: "综合报告", content: "请填写报告主题" })
      return
    }

    try {
      setBusy("spark")
      const response = await fetch("/api/sparkpage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: sparkQuery }),
      })
      const payload = await response.json().catch(() => ({}))
      setResult({ title: "综合报告结果", content: response.ok ? payload.sparkpage || payload : payload.error || "生成失败" })
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="min-h-screen bg-[var(--paper-50)] px-4 py-6 dark:bg-[var(--paper-50)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--ink-700)] dark:text-[var(--ink-200)]">工具中心</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal sm:text-3xl font-[var(--font-display)]">所有后端工具都有前端入口</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-500)]">
              文档处理、图片 OCR、网页搜索、演示文稿和综合报告统一放在这里；音乐、语音和上传能力在聊天页对应模型中使用。
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/chat/suno-v5">音乐创作</Link>
          </Button>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-[var(--radius-sharp)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><FileText className="size-5 text-[var(--ink-600)]" />文档处理</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={runDocumentProcess}>
                  <Label htmlFor="document-file">上传 PDF / Word / 图片 / 文本</Label>
                  <Input id="document-file" type="file" onChange={(event) => setDocumentFile(event.target.files?.[0] || null)} />
                  <Button type="submit" disabled={busy === "document"} className="w-full">
                    {busy === "document" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    提取文本
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="rounded-[var(--radius-sharp)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Wand2 className="size-5 text-[var(--ink-600)]" />图片 OCR</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={runOcr}>
                  <Label htmlFor="ocr-images">图片 URL，每行一个</Label>
                  <Textarea id="ocr-images" rows={4} value={ocrImages} onChange={(event) => setOcrImages(event.target.value)} placeholder="https://..." />
                  <Button type="submit" disabled={busy === "ocr"} className="w-full">
                    {busy === "ocr" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    识别文字
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="rounded-[var(--radius-sharp)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Presentation className="size-5 text-[var(--ink-600)]" />演示文稿</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={runPresentation}>
                  <Label htmlFor="presentation-content">课件或汇报内容</Label>
                  <Textarea id="presentation-content" rows={5} value={presentationContent} onChange={(event) => setPresentationContent(event.target.value)} placeholder="粘贴要生成演示文稿的内容..." />
                  <Button type="submit" disabled={busy === "presentation"} className="w-full">
                    {busy === "presentation" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    生成演示文稿
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="rounded-[var(--radius-sharp)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Search className="size-5 text-[var(--ink-600)]" />网页搜索</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={runSearch}>
                  <Label htmlFor="search-query">搜索问题</Label>
                  <Input id="search-query" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="例如：牛顿第二定律生活例子" />
                  <Button type="submit" disabled={busy === "search"} className="w-full">
                    {busy === "search" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    搜索
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="rounded-[var(--radius-sharp)] lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="size-5 text-[var(--ink-600)]" />Sparkpage 综合报告</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="grid gap-3 md:grid-cols-[1fr_auto]" onSubmit={runSparkpage}>
                  <Input value={sparkQuery} onChange={(event) => setSparkQuery(event.target.value)} placeholder="输入要综合分析的主题" />
                  <Button type="submit" disabled={busy === "spark"}>
                    {busy === "spark" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    生成报告
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-[var(--radius-sharp)]">
            <CardHeader>
              <CardTitle className="text-base">{result?.title || "结果预览"}</CardTitle>
            </CardHeader>
            <CardContent>
              {result ? <JsonBlock value={result.content} /> : (
                <div className="rounded-[var(--radius-soft)] border border-dashed py-16 text-center text-sm text-[var(--ink-500)]">
                  运行左侧任意工具后，结果会显示在这里。
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
