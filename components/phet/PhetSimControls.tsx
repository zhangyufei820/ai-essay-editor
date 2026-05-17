"use client"

import { ButtonV2 as Button } from "@/components/ui/v2"
import { ArrowLeft, Languages, Maximize2, RotateCcw } from "lucide-react"
import { useRouter } from "next/navigation"
import type { PhetLocale } from "@/lib/phet/phet-utils"

export function PhetSimControls({
  locale,
  onLocaleChange,
  onFullscreen,
  onRetry,
}: {
  locale: PhetLocale
  onLocaleChange: (locale: PhetLocale) => void
  onFullscreen: () => void
  onRetry: () => void
}) {
  const router = useRouter()

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ink-900)]/10 bg-[var(--paper-50)]/92 px-3 py-2 backdrop-blur dark:border-[var(--ink-200)]/10 dark:bg-slate-950/92">
      <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/lab")}>
        <ArrowLeft className="h-4 w-4" />
        返回实验室
      </Button>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={locale === "zh_CN" ? "primary" : "outline"}
          size="sm"
          onClick={() => onLocaleChange("zh_CN")}
        >
          <Languages className="h-4 w-4" />
          中
        </Button>
        <Button
          type="button"
          variant={locale === "en" ? "primary" : "outline"}
          size="sm"
          onClick={() => onLocaleChange("en")}
        >
          En
        </Button>
        <Button type="button" variant="outline" size="icon-sm" onClick={onRetry} aria-label="重新加载实验">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon-sm" onClick={onFullscreen} aria-label="全屏实验">
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
