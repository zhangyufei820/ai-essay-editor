"use client"

import { ButtonV2 as Button } from "@/components/ui/v2"
import { useMemo, useRef, useState } from "react"
import { AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { buildPhetSimUrl, type PhetLocale } from "@/lib/phet/phet-utils"
import { PhetSimControls } from "@/components/phet/PhetSimControls"
import { PhetSimSkeleton } from "@/components/phet/PhetSimSkeleton"

interface PhetSimEmbedProps {
  simId: string
  locale?: PhetLocale
  width?: string
  height?: string
  allowFullscreen?: boolean
  className?: string
  onLoad?: () => void
  onError?: () => void
  showControls?: boolean
}

export function PhetSimEmbed({
  simId,
  locale: initialLocale = "zh_CN",
  width = "100%",
  height = "600px",
  allowFullscreen = true,
  className,
  onLoad,
  onError,
  showControls = true,
}: PhetSimEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [locale, setLocale] = useState<PhetLocale>(initialLocale)
  const [reloadKey, setReloadKey] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const src = useMemo(() => buildPhetSimUrl(simId, locale), [locale, simId])

  const retry = () => {
    setHasError(false)
    setIsLoading(true)
    setReloadKey((value) => value + 1)
  }

  const fullscreen = () => {
    void containerRef.current?.requestFullscreen?.()
  }

  return (
    <div
      ref={containerRef}
      className={cn("overflow-hidden rounded-[var(--radius-soft)] border border-emerald-900/10 bg-[var(--paper-50)] shadow-sm dark:border-[var(--ink-200)]/10 dark:bg-slate-950", className)}
      style={{ width }}
    >
      {showControls ? (
        <PhetSimControls
          locale={locale}
          onLocaleChange={(nextLocale) => {
            setLocale(nextLocale)
            setIsLoading(true)
            setHasError(false)
          }}
          onFullscreen={fullscreen}
          onRetry={retry}
        />
      ) : null}
      <div className="relative aspect-[4/3] w-full min-h-[320px] sm:min-h-[420px]" style={{ height }}>
        {isLoading && !hasError ? <PhetSimSkeleton className="absolute inset-0 z-10 rounded-none" /> : null}
        {hasError ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[var(--paper-50)] p-6 text-center dark:bg-slate-950">
            <AlertCircle className="mb-3 h-10 w-10 text-amber-500" />
            <h2 className="text-base font-semibold text-[var(--ink-900)] dark:text-white">实验加载失败</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-[var(--ink-600)] dark:text-slate-300">
              可能是网络或 PhET 资源临时不可用。可以重试，或切换中英文版本。
            </p>
            <Button type="button" className="mt-5" onClick={retry}>重试</Button>
          </div>
        ) : null}
        <iframe
          key={`${src}-${reloadKey}`}
          title={`PhET simulation ${simId}`}
          src={src}
          className="h-full w-full border-0"
          sandbox="allow-scripts allow-same-origin"
          loading="lazy"
          allowFullScreen={allowFullscreen}
          onLoad={() => {
            setIsLoading(false)
            onLoad?.()
          }}
          onError={() => {
            setIsLoading(false)
            setHasError(true)
            onError?.()
          }}
        />
      </div>
    </div>
  )
}
