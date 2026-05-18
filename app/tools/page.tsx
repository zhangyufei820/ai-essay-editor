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
import { useState, type ComponentType, type FormEvent, type ReactNode } from "react"
import { Loader2, Presentation, Search, Wand2 } from "lucide-react"
import { IconAllInOne, IconEssay } from "@/components/icons/v2"

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

function ToolCard({
  index,
  title,
  description,
  icon: Icon,
  children,
  featured = false,
}: {
  index: string
  title: string
  description: string
  icon: ComponentType<any>
  children: ReactNode
  featured?: boolean
}) {
  return (
    <Card
      className={[
        "group w-full min-w-0 max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--radius-sharp)] border-[var(--paper-200)] bg-[var(--paper-50)] sm:max-w-none",
        "shadow-[0_1px_0_rgba(16,55,35,0.04),0_18px_48px_rgba(16,55,35,0.06)] transition duration-300",
        "hover:-translate-y-0.5 hover:border-[var(--ink-200)] hover:shadow-[0_18px_70px_rgba(16,55,35,0.11)]",
        featured ? "lg:col-span-2" : "",
      ].join(" ")}
    >
      <CardHeader className="border-b border-[var(--paper-200)] bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(247,244,235,0.36))]">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-soft)] border border-[var(--ink-100)] bg-[var(--ink-50)] text-[var(--ink-700)]">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold text-[var(--seal-600)]">{index}</span>
              <CardTitle className="text-[17px] leading-6 text-[var(--ink-900)]">{title}</CardTitle>
            </div>
            <p className="text-[13px] leading-5 text-[var(--ink-500)]">{description}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
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
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-[linear-gradient(180deg,var(--paper-50)_0%,var(--paper-100)_100%)] px-4 py-5 dark:bg-[var(--paper-50)] sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <header className="w-full min-w-0 max-w-[calc(100vw-2rem)] rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[rgba(255,255,255,0.58)] px-5 py-4 shadow-[0_18px_60px_rgba(16,55,35,0.08)] backdrop-blur sm:max-w-none">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--seal-600)]">Tools Desk</p>
              <h1 className="mt-2 font-[var(--font-display)] text-2xl font-black leading-tight text-[var(--ink-900)] sm:text-3xl">
                工具工作台
              </h1>
            </div>
            <div className="hidden w-full min-w-0 grid-cols-3 gap-2 text-center sm:grid md:w-auto">
              {[
                ["5", "可用工具"],
                ["API", "实时处理"],
                ["1", "结果面板"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="min-w-0 rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] px-2 py-2 shadow-sm sm:px-3"
                >
                  <div className="font-[var(--font-display)] text-lg font-black text-[var(--ink-800)]">{value}</div>
                  <div className="mt-0.5 text-[11px] font-medium leading-4 text-[var(--ink-500)]">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <ToolCard index="01" title="文档处理" description="上传学习资料，提取可继续加工的文本。" icon={IconEssay}>
              <form className="space-y-3" onSubmit={runDocumentProcess}>
                <Label htmlFor="document-file">上传 PDF / Word / 图片 / 文本</Label>
                <Input id="document-file" type="file" onChange={(event) => setDocumentFile(event.target.files?.[0] || null)} />
                <Button type="submit" disabled={busy === "document"} className="w-full">
                  {busy === "document" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  提取文本
                </Button>
              </form>
            </ToolCard>

            <ToolCard index="02" title="图片 OCR" description="把图片链接中的文字识别出来，适合资料整理。" icon={Wand2}>
              <form className="space-y-3" onSubmit={runOcr}>
                <Label htmlFor="ocr-images">图片 URL，每行一个</Label>
                <Textarea id="ocr-images" rows={4} value={ocrImages} onChange={(event) => setOcrImages(event.target.value)} placeholder="https://..." />
                <Button type="submit" disabled={busy === "ocr"} className="w-full">
                  {busy === "ocr" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  识别文字
                </Button>
              </form>
            </ToolCard>

            <ToolCard index="03" title="演示文稿" description="把课件、汇报素材快速整理成演示结构。" icon={Presentation}>
              <form className="space-y-3" onSubmit={runPresentation}>
                <Label htmlFor="presentation-content">课件或汇报内容</Label>
                <Textarea id="presentation-content" rows={5} value={presentationContent} onChange={(event) => setPresentationContent(event.target.value)} placeholder="粘贴要生成演示文稿的内容..." />
                <Button type="submit" disabled={busy === "presentation"} className="w-full">
                  {busy === "presentation" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  生成演示文稿
                </Button>
              </form>
            </ToolCard>

            <ToolCard index="04" title="网页搜索" description="围绕一个问题抓取网页结果，辅助备课和调研。" icon={Search}>
              <form className="space-y-3" onSubmit={runSearch}>
                <Label htmlFor="search-query">搜索问题</Label>
                <Input id="search-query" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="例如：牛顿第二定律生活例子" />
                <Button type="submit" disabled={busy === "search"} className="w-full">
                  {busy === "search" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  搜索
                </Button>
              </form>
            </ToolCard>

            <ToolCard index="05" title="Sparkpage 综合报告" description="输入主题，生成更完整的资料整理和综合分析结果。" icon={IconAllInOne} featured>
              <form className="grid gap-3 md:grid-cols-[1fr_auto]" onSubmit={runSparkpage}>
                <Input value={sparkQuery} onChange={(event) => setSparkQuery(event.target.value)} placeholder="输入要综合分析的主题" />
                <Button type="submit" disabled={busy === "spark"}>
                  {busy === "spark" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  生成报告
                </Button>
              </form>
            </ToolCard>
          </div>

          <Card className="w-full min-w-0 max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--radius-sharp)] border-[var(--paper-200)] bg-[var(--paper-50)] shadow-[0_24px_80px_rgba(16,55,35,0.1)] sm:max-w-none xl:sticky xl:top-5 xl:self-start">
            <CardHeader className="border-b border-[var(--paper-200)] bg-[var(--ink-50)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--seal-600)]">Output</p>
                  <CardTitle className="mt-1 text-lg text-[var(--ink-900)]">{result?.title || "结果预览"}</CardTitle>
                </div>
                <span className="flex size-9 items-center justify-center rounded-[var(--radius-soft)] border border-[var(--ink-100)] bg-[var(--paper-50)] text-[var(--ink-700)]">
                  <IconAllInOne className="size-4" aria-hidden="true" />
                </span>
              </div>
            </CardHeader>
            <CardContent className="min-h-[420px] p-5">
              {result ? <JsonBlock value={result.content} /> : (
                <div className="flex min-h-[340px] flex-col items-center justify-center rounded-[var(--radius-soft)] border border-dashed border-[var(--paper-300)] bg-[linear-gradient(180deg,rgba(255,255,255,0.56),rgba(247,244,235,0.42))] px-6 text-center">
                  <span className="mb-4 flex size-12 items-center justify-center rounded-[var(--radius-soft)] border border-[var(--ink-100)] bg-[var(--ink-50)] text-[var(--ink-700)]">
                    <IconAllInOne className="size-5" aria-hidden="true" />
                  </span>
                  <p className="font-[var(--font-display)] text-lg font-bold text-[var(--ink-800)]">等待生成结果</p>
                  <p className="mt-2 max-w-56 text-sm leading-6 text-[var(--ink-500)]">
                    选择左侧任意工具运行后，文本、报告或搜索结果会在这里集中呈现。
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
