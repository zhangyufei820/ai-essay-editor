import Link from "next/link"
import { ArrowUpRight, Box, ExternalLink, Info } from "lucide-react"
import {
  ButtonV2 as Button,
  CardV2 as Card,
  CardV2Content as CardContent,
  CardV2Header as CardHeader,
  CardV2Title as CardTitle,
} from "@/components/ui/v2"

const TRIPO_APP_URL = "https://www.tripo3d.ai/app"

export const metadata = {
  title: "Tripo3D｜沈翔智学",
  description: "从多媒体专区进入 Tripo3D，生成和编辑 3D 模型。",
}

export default function Tripo3DPage() {
  return (
    <main className="min-h-screen bg-[var(--paper-50)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/tools"
              className="inline-flex items-center text-sm font-medium text-[var(--ink-600)] hover:text-[var(--ink-800)]"
            >
              返回工具中心
            </Link>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-[var(--radius-soft)] bg-[var(--ink-50)] text-[var(--ink-700)]">
                <Box className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-500)]">
                  Multimedia Zone
                </p>
                <h1 className="font-[var(--font-display)] text-3xl font-bold text-[var(--ink-900)]">
                  Tripo3D 模型生成
                </h1>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--ink-600)]">
              用文字或图片生成 3D 模型。Tripo 官方应用限制跨站嵌入时，请使用下方按钮在新窗口打开。
            </p>
          </div>

          <Button asChild variant="primary">
            <a href={TRIPO_APP_URL} target="_blank" rel="noreferrer">
              打开 Tripo3D
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          </Button>
        </header>

        <Card className="overflow-hidden rounded-[var(--radius-sharp)] border-[var(--paper-200)] bg-white shadow-[var(--shadow-paper)]">
          <CardHeader className="border-b border-[var(--paper-200)] bg-[var(--paper-50)]">
            <CardTitle className="flex items-center gap-2 text-base text-[var(--ink-800)]">
              <ExternalLink className="size-4 text-[var(--ink-600)]" aria-hidden="true" />
              Tripo3D 官方工作台
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative min-h-[680px] bg-[var(--paper-100)]">
              <iframe
                title="Tripo3D"
                src={TRIPO_APP_URL}
                className="h-[680px] w-full border-0 bg-white"
                referrerPolicy="no-referrer-when-downgrade"
                allow="clipboard-read; clipboard-write; fullscreen"
              />

              <div className="absolute bottom-4 left-4 right-4 rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-white/95 p-4 shadow-[var(--shadow-paper)] backdrop-blur">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Info className="mt-0.5 size-4 shrink-0 text-[var(--ink-600)]" aria-hidden="true" />
                    <p className="text-sm leading-6 text-[var(--ink-600)]">
                      如果上方区域空白，是 Tripo 官方的跨站嵌入策略拦截了 iframe；点击右侧按钮即可继续使用。
                    </p>
                  </div>
                  <Button asChild variant="outline" className="shrink-0">
                    <a href={TRIPO_APP_URL} target="_blank" rel="noreferrer">
                      新窗口打开
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
