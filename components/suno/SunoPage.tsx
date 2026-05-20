"use client"

import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Loader2,
  Music2,
  Music4,
  Pause,
  Play,
  RotateCw,
  Sparkles,
  Volume2,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertV2 as Alert,
  AlertV2Description as AlertDescription,
  BadgeV2 as Badge,
  ButtonV2 as Button,
  CardV2 as Card,
  CardV2Content as CardContent,
  CardV2Description as CardDescription,
  CardV2Header as CardHeader,
  CardV2Title as CardTitle,
  InputV2 as Input,
  LabelV2 as Label,
  TextareaV2 as Textarea,
} from "@/components/ui/v2"
import {
  buildDifyInputs,
  parseDifyResult,
  type SunoWorkflowResult,
} from "@/lib/suno-workflow-schema"
import { cn } from "@/lib/utils"

type SongStatus = "idle" | "submitting" | "waiting" | "ready" | "failed"
type RecentSong = {
  id: string
  title: string
  taskId?: string
  clipId?: string
  audioUrls: string[]
  imageUrls: string[]
  createdAt: string
}
type SongResult = SunoWorkflowResult & {
  response_json?: unknown
}

type SongForm = {
  prompt: string
  title: string
  tags: string
  instrumental: boolean
}

const DRAFT_KEY = "suno-simple-draft"
const RECENT_KEY = "suno-simple-recent"
const POLL_INTERVAL_MS = 8000
const POLL_TIMEOUT_MS = 8 * 60 * 1000

const DEFAULT_FORM: SongForm = {
  prompt: "",
  title: "",
  tags: "流行、抒情、钢琴",
  instrumental: false,
}

const STATUS_TEXT: Record<SongStatus, string> = {
  idle: "等待创作",
  submitting: "正在提交",
  waiting: "正在生成",
  ready: "可以试听",
  failed: "生成失败",
}

function toText(value: unknown) {
  if (value === undefined || value === null) return ""
  return String(value)
}

function readNested(value: unknown, path: Array<string | number>): unknown {
  let current = value as any
  for (const key of path) {
    if (current === undefined || current === null) return undefined
    current = current[key]
  }
  return current
}

function collectStringValues(value: unknown, keyMatchers: Array<(key: string) => boolean>, limit = 12): string[] {
  const found = new Set<string>()
  const visit = (node: unknown) => {
    if (found.size >= limit || !node || typeof node !== "object") return
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    for (const [key, item] of Object.entries(node as Record<string, unknown>)) {
      if (typeof item === "string" && keyMatchers.some((matcher) => matcher(key))) {
        found.add(item)
      } else if (Array.isArray(item)) {
        item.forEach((child) => {
          if (typeof child === "string" && keyMatchers.some((matcher) => matcher(key))) found.add(child)
          else visit(child)
        })
      } else if (item && typeof item === "object") {
        visit(item)
      }
    }
  }
  visit(value)
  return Array.from(found).filter(Boolean)
}

function normalizeSongResult(payload: unknown): SongResult {
  const parsed = parseDifyResult(payload)
  const responseJson = parsed.response_json ?? payload
  const audioUrls = new Set(parsed.audio_urls || [])
  const imageUrls = new Set(parsed.image_urls || [])
  const videoUrls = new Set(parsed.video_urls || [])

  collectStringValues(responseJson, [
    (key) => /audio_url|audioUrl|stream_audio_url|streamAudioUrl/i.test(key),
  ]).forEach((url) => audioUrls.add(url))
  collectStringValues(responseJson, [
    (key) => /image_url|imageUrl|cover_url|coverUrl/i.test(key),
  ]).forEach((url) => imageUrls.add(url))
  collectStringValues(responseJson, [
    (key) => /video_url|videoUrl/i.test(key),
  ]).forEach((url) => videoUrls.add(url))

  const taskId = parsed.task_id || toText(readNested(responseJson, ["task_id"])) || toText(readNested(responseJson, ["data", "task_id"]))
  const clipId = parsed.clip_id || toText(readNested(responseJson, ["clip_id"])) || toText(readNested(responseJson, ["data", "clip_id"]))
  const status = parsed.status || toText(readNested(responseJson, ["status"])) || toText(readNested(responseJson, ["data", "status"]))

  return {
    ...parsed,
    task_id: taskId,
    clip_id: clipId,
    status,
    audio_urls: Array.from(audioUrls),
    image_urls: Array.from(imageUrls),
    video_urls: Array.from(videoUrls),
    response_json: responseJson,
  }
}

function isFinishedStatus(status?: string) {
  const text = (status || "").toLowerCase()
  return ["complete", "completed", "success", "succeeded", "finished", "done"].some((item) => text.includes(item))
}

function isFailedStatus(status?: string) {
  const text = (status || "").toLowerCase()
  return ["fail", "failed", "error", "cancel", "rejected"].some((item) => text.includes(item))
}

function displayTitle(title: string, prompt: string) {
  return title.trim() || prompt.trim().split("\n")[0]?.slice(0, 16) || "我的新歌"
}

async function runSuno(values: Record<string, unknown>) {
  const response = await fetch("/api/suno/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildDifyInputs(values)),
  })
  const payload = await response.json().catch(() => ({ success: false, error: "服务器返回内容无法读取" }))
  const parsed = normalizeSongResult(payload)
  return {
    ...parsed,
    success: Boolean(payload.success ?? parsed.success),
    http_status: payload.http_status ?? response.status,
    error: payload.error ?? parsed.error,
    response_json: payload.response_json ?? payload,
  }
}

function WaveAnimation({ active }: { active: boolean }) {
  return (
    <div className="flex h-10 items-end justify-center gap-1" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6].map((index) => (
        <span
          key={index}
          className={cn(
            "w-1.5 rounded-full bg-[var(--ink-500)]/70",
            active ? "animate-[suno-wave_1.15s_ease-in-out_infinite]" : "h-3 opacity-45",
          )}
          style={{
            height: active ? `${14 + (index % 4) * 7}px` : undefined,
            animationDelay: `${index * 0.09}s`,
          }}
        />
      ))}
    </div>
  )
}

function ProgressSteps({ status }: { status: SongStatus }) {
  const steps = ["提交创作", "生成歌曲", "准备试听"]
  const activeIndex = status === "submitting" ? 0 : status === "waiting" ? 1 : status === "ready" ? 2 : 0
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {steps.map((step, index) => {
        const done = status === "ready" || index < activeIndex
        const active = index === activeIndex && status !== "idle" && status !== "failed"
        return (
          <div
            key={step}
            className={cn(
              "flex items-center gap-2 rounded-[var(--radius-soft)] border px-3 py-2 text-sm",
              done || active ? "border-[var(--ink-200)] bg-[var(--ink-50)] text-[var(--ink-800)]" : "border-[var(--paper-200)] bg-[var(--paper-100)] text-[var(--ink-400)]",
            )}
          >
            {done ? <CheckCircle2 className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
            {step}
          </div>
        )
      })}
    </div>
  )
}

function SongPlayer({
  result,
  title,
  status,
}: {
  result: SongResult | null
  title: string
  status: SongStatus
}) {
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrls = result?.audio_urls || []
  const imageUrl = result?.image_urls?.[current] || result?.image_urls?.[0] || ""
  const audioUrl = audioUrls[current] || ""
  const ready = status === "ready" && audioUrl

  useEffect(() => {
    setCurrent(0)
    setPlaying(false)
  }, [audioUrls.join("|")])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const handlePlay = () => setPlaying(true)
    const handlePause = () => setPlaying(false)
    audio.addEventListener("play", handlePlay)
    audio.addEventListener("pause", handlePause)
    audio.addEventListener("ended", handlePause)
    return () => {
      audio.removeEventListener("play", handlePlay)
      audio.removeEventListener("pause", handlePause)
      audio.removeEventListener("ended", handlePause)
    }
  }, [audioUrl])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio || !ready) return
    if (audio.paused) void audio.play()
    else audio.pause()
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="grid min-h-[520px] lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative flex flex-col justify-between overflow-hidden bg-[var(--ink-900)] p-6 text-white">
            <div className="absolute inset-0 opacity-20 [background:radial-gradient(circle_at_30%_20%,rgba(255,255,255,.35),transparent_32%),linear-gradient(140deg,rgba(20,83,45,.8),rgba(14,27,17,.95))]" />
            <div className="relative z-10">
              <Badge variant="paper" className="bg-white/90">{STATUS_TEXT[status]}</Badge>
              <h2 className="mt-4 font-[var(--font-display)] text-3xl font-bold leading-tight">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-white/70">系统会自动等待歌曲生成，完成后这里会出现试听和下载。</p>
            </div>

            <div className="relative z-10 my-8 flex justify-center">
              <div className="relative grid size-64 place-items-center rounded-[var(--radius-sharp)] border border-white/15 bg-white/10 shadow-2xl backdrop-blur">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="歌曲封面" className="absolute inset-0 h-full w-full rounded-[var(--radius-sharp)] object-cover" />
                ) : (
                  <Music4 className="size-20 text-white/55" />
                )}
                {status === "waiting" || status === "submitting" ? (
                  <div className="absolute inset-0 grid place-items-center rounded-[var(--radius-sharp)] bg-black/35">
                    <WaveAnimation active />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="relative z-10">
              <WaveAnimation active={playing || status === "waiting" || status === "submitting"} />
            </div>
          </div>

          <div className="flex flex-col justify-between bg-[var(--paper-50)] p-5 sm:p-7">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink-500)]">生成结果</p>
                  <h3 className="mt-1 font-[var(--font-display)] text-2xl font-bold text-[var(--ink-900)]">
                    {ready ? "歌曲已生成" : status === "failed" ? "这次没有生成成功" : "正在为你作曲"}
                  </h3>
                </div>
                {result?.task_id ? <Badge variant="ink">任务已记录</Badge> : null}
              </div>

              <div className="mt-6">
                <ProgressSteps status={status} />
              </div>

              {!ready ? (
                <div className="mt-8 rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-100)] p-6 text-center">
                  {status === "failed" ? <AlertCircle className="mx-auto mb-3 size-9 text-[var(--seal-600)]" /> : <Loader2 className="mx-auto mb-3 size-9 animate-spin text-[var(--ink-600)]" />}
                  <p className="font-semibold text-[var(--ink-800)]">
                    {status === "failed" ? "生成失败，请调整提示词后再试" : status === "idle" ? "输入歌词提示词后开始生成" : "歌曲生成通常需要几分钟"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink-500)]">
                    {status === "failed" ? "如果已经扣费但没有结果，请保留任务记录联系客服核对。" : "你不用手动查询，系统会自动刷新结果。"}
                  </p>
                </div>
              ) : (
                <div className="mt-8 grid gap-4">
                  <audio ref={audioRef} src={audioUrl} controls className="w-full" preload="metadata" />
                  <div className="flex flex-wrap gap-3">
                    <Button type="button" onClick={togglePlay}>
                      {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      {playing ? "暂停" : "试听"}
                    </Button>
                    <Button asChild variant="seal">
                      <a href={audioUrl} download>
                        <Download className="h-4 w-4" />
                        下载歌曲
                      </a>
                    </Button>
                  </div>
                  {audioUrls.length > 1 ? (
                    <div className="flex flex-wrap gap-2">
                      {audioUrls.map((url, index) => (
                        <Button key={url} type="button" variant={current === index ? "outline" : "ghost"} size="sm" onClick={() => setCurrent(index)}>
                          版本{index + 1}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="mt-8 grid gap-2 rounded-[var(--radius-soft)] bg-[var(--paper-100)] p-4 text-sm text-[var(--ink-600)]">
              <div className="flex items-center gap-2"><Volume2 className="h-4 w-4" />完成后可直接在线试听。</div>
              <div className="flex items-center gap-2"><Download className="h-4 w-4" />下载按钮会在歌曲生成后出现。</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function RecentSongs({ items, onSelect }: { items: RecentSong[]; onSelect: (item: RecentSong) => void }) {
  return (
    <Card variant="inset">
      <CardHeader>
        <CardTitle className="text-base">最近生成</CardTitle>
        <CardDescription>保存在当前浏览器，方便继续试听。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 pt-0">
        {items.length === 0 ? (
          <p className="text-sm text-[var(--ink-500)]">还没有生成记录。</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className="flex items-center gap-3 rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-3 text-left transition hover:border-[var(--ink-300)]"
            >
              <div className="grid size-10 place-items-center rounded-[var(--radius-soft)] bg-[var(--ink-50)] text-[var(--ink-700)]">
                <Music2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[var(--ink-800)]">{item.title}</div>
                <div className="text-xs text-[var(--ink-400)]">{new Date(item.createdAt).toLocaleString("zh-CN")}</div>
              </div>
              <Badge variant="paper">试听</Badge>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  )
}

export function SunoPage() {
  const [form, setForm] = useState<SongForm>(DEFAULT_FORM)
  const [status, setStatus] = useState<SongStatus>("idle")
  const [result, setResult] = useState<SongResult | null>(null)
  const [error, setError] = useState("")
  const [recent, setRecent] = useState<RecentSong[]>([])
  const [pollStartedAt, setPollStartedAt] = useState<number | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeTaskIdRef = useRef("")

  const title = useMemo(() => displayTitle(form.title, form.prompt), [form.title, form.prompt])
  const canSubmit = form.prompt.trim().length > 0 && status !== "submitting" && status !== "waiting"

  useEffect(() => {
    try {
      const draft = window.localStorage.getItem(DRAFT_KEY)
      if (draft) setForm({ ...DEFAULT_FORM, ...JSON.parse(draft) })
      const storedRecent = window.localStorage.getItem(RECENT_KEY)
      if (storedRecent) setRecent(JSON.parse(storedRecent))
    } catch {
      window.localStorage.removeItem(DRAFT_KEY)
      window.localStorage.removeItem(RECENT_KEY)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form))
  }, [form])

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [])

  function saveRecent(next: SongResult) {
    if (!next.audio_urls?.length) return
    const item: RecentSong = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      title,
      taskId: next.task_id,
      clipId: next.clip_id,
      audioUrls: next.audio_urls,
      imageUrls: next.image_urls || [],
      createdAt: new Date().toISOString(),
    }
    const updated = [item, ...recent].slice(0, 12)
    setRecent(updated)
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(updated))
  }

  async function pollTask(taskId: string, startedAt: number) {
    if (!taskId || activeTaskIdRef.current !== taskId) return
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      setStatus("failed")
      setError("生成时间较长，系统暂时没有拿到歌曲。你可以稍后刷新最近记录或重新提交。")
      return
    }

    try {
      const next = await runSuno({ operation: "fetch_task", task_id: taskId })
      setResult((previous) => ({ ...(previous || next), ...next }))
      if (next.audio_urls?.length) {
        setStatus("ready")
        saveRecent(next)
        return
      }
      if (isFinishedStatus(next.status)) {
        setStatus("failed")
        setError("系统显示任务已结束，但暂时没有拿到歌曲文件。请稍后再试。")
        return
      }
      if (isFailedStatus(next.status) || next.error) {
        setStatus("failed")
        setError("歌曲生成失败，请换一个提示词再试。")
        return
      }
    } catch {
      // 网络抖动时继续下一轮，避免把可恢复错误直接暴露给用户。
    }

    pollTimerRef.current = setTimeout(() => pollTask(taskId, startedAt), POLL_INTERVAL_MS)
  }

  async function submitSong() {
    if (!form.prompt.trim()) {
      setError("请先输入歌词或创作提示。")
      return
    }
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)

    setStatus("submitting")
    setError("")
    setResult(null)
    activeTaskIdRef.current = ""

    try {
      const next = await runSuno({
        operation: "music_custom",
        prompt: form.prompt,
        title: form.title || title,
        tags: form.tags || "流行、抒情、钢琴",
        negative_tags: "噪音、低质量、刺耳",
        mv: "chirp-v5",
        generation_type: "TEXT",
        make_instrumental: form.instrumental ? "true" : "false",
      })
      setResult(next)

      if (!next.success) {
        setStatus("failed")
        setError(toText(next.error) || "提交失败，请稍后重试。")
        return
      }
      if (next.audio_urls?.length) {
        setStatus("ready")
        saveRecent(next)
        return
      }
      if (!next.task_id) {
        setStatus("failed")
        setError("任务已提交，但没有拿到任务编号，请稍后重试。")
        return
      }

      activeTaskIdRef.current = next.task_id
      const startedAt = Date.now()
      setPollStartedAt(startedAt)
      setStatus("waiting")
      pollTimerRef.current = setTimeout(() => pollTask(next.task_id!, startedAt), POLL_INTERVAL_MS)
    } catch (submitError) {
      setStatus("failed")
      setError(submitError instanceof Error ? submitError.message : "提交失败，请稍后重试。")
    }
  }

  function resetComposer() {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    activeTaskIdRef.current = ""
    setStatus("idle")
    setResult(null)
    setError("")
    setPollStartedAt(null)
  }

  function selectRecent(item: RecentSong) {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    activeTaskIdRef.current = ""
    setForm((previous) => ({ ...previous, title: item.title }))
    setResult({
      success: true,
      task_id: item.taskId,
      clip_id: item.clipId,
      audio_urls: item.audioUrls,
      image_urls: item.imageUrls,
      response_json: item,
    })
    setStatus("ready")
    setError("")
  }

  const elapsedText = pollStartedAt && status === "waiting"
    ? `已等待 ${Math.max(1, Math.floor((Date.now() - pollStartedAt) / 1000))} 秒`
    : ""

  return (
    <div className="min-h-screen bg-[var(--paper-50)] px-4 py-8 font-[var(--font-sans-v2)]">
      <style jsx global>{`
        @keyframes suno-wave {
          0%, 100% { transform: scaleY(0.45); opacity: 0.55; }
          50% { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 grid gap-5 border-b border-[var(--paper-200)] pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--ink-200)] bg-[var(--ink-50)] px-3 py-1.5 text-sm font-semibold text-[var(--ink-700)]">
              <Sparkles className="h-4 w-4" />
              输入想法，自动生成歌曲
            </div>
            <h1 className="font-[var(--font-display)] text-4xl font-bold leading-tight text-[var(--ink-900)] sm:text-5xl">智能音乐生成</h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[var(--ink-600)]">
              写下歌词或一句创作提示，系统会自动提交、等待并刷新结果。歌曲完成后，你可以直接试听和下载。
            </p>
          </div>
          <div className="rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-100)] px-4 py-3 text-sm text-[var(--ink-600)]">
            <div className="font-semibold text-[var(--ink-800)]">{STATUS_TEXT[status]}</div>
            <div>{elapsedText || "无需手动查询"}</div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(360px,0.82fr)_minmax(0,1.18fr)]">
          <section className="grid gap-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  创作内容
                </CardTitle>
                <CardDescription>只需要填写这几项，系统会自动匹配合适的创作参数。</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <div>
                  <Label htmlFor="song_prompt">歌词或提示词</Label>
                  <Textarea
                    id="song_prompt"
                    rows={8}
                    placeholder="例如：写一首关于毕业那天、操场晚风和朋友告别的中文流行歌。也可以直接粘贴完整歌词。"
                    value={form.prompt}
                    onChange={(event) => setForm((previous) => ({ ...previous, prompt: event.target.value }))}
                    disabled={status === "submitting" || status === "waiting"}
                    invalid={Boolean(error && !form.prompt.trim())}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="song_title">歌曲名</Label>
                    <Input
                      id="song_title"
                      placeholder="不填则自动取名"
                      value={form.title}
                      onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))}
                      disabled={status === "submitting" || status === "waiting"}
                    />
                  </div>
                  <div>
                    <Label htmlFor="song_tags">歌曲风格</Label>
                    <Input
                      id="song_tags"
                      placeholder="流行、抒情、钢琴"
                      value={form.tags}
                      onChange={(event) => setForm((previous) => ({ ...previous, tags: event.target.value }))}
                      disabled={status === "submitting" || status === "waiting"}
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-100)] px-4 py-3">
                  <span>
                    <span className="block text-sm font-semibold text-[var(--ink-800)]">只生成伴奏</span>
                    <span className="block text-xs text-[var(--ink-500)]">打开后不生成人声演唱。</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.instrumental}
                    onChange={(event) => setForm((previous) => ({ ...previous, instrumental: event.target.checked }))}
                    disabled={status === "submitting" || status === "waiting"}
                    className="size-5 accent-[var(--ink-600)]"
                  />
                </label>

                {error ? (
                  <Alert variant="error">
                    <AlertCircle data-icon className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <Button type="button" size="lg" onClick={submitSong} disabled={!canSubmit}>
                    {status === "submitting" || status === "waiting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music4 className="h-4 w-4" />}
                    {status === "submitting" ? "正在提交" : status === "waiting" ? "正在生成" : "生成歌曲"}
                  </Button>
                  <Button type="button" variant="outline" size="lg" onClick={resetComposer} disabled={status === "submitting"}>
                    <RotateCw className="h-4 w-4" />
                    重新填写
                  </Button>
                </div>
              </CardContent>
            </Card>

            <RecentSongs items={recent} onSelect={selectRecent} />
          </section>

          <section>
            <SongPlayer result={result} title={title} status={status} />
          </section>
        </div>
      </div>
    </div>
  )
}

export default SunoPage
