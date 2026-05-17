"use client"

import dynamic from "next/dynamic"

const PhetSimBrowser = dynamic(
  () => import("@/components/phet/PhetSimBrowser").then((mod) => ({ default: mod.PhetSimBrowser })),
  {
    ssr: false,
    loading: () => <PhetBrowserFallback />,
  },
)

function PhetBrowserFallback() {
  return (
    <div className="space-y-7" aria-label="实验目录加载中">
      <section className="rounded-[var(--radius-soft)] border border-[var(--ink-900)]/10 bg-[var(--paper-50)] p-4 shadow-sm dark:border-[var(--ink-200)]/10 dark:bg-slate-950">
        <div className="grid gap-3 lg:grid-cols-[1fr_160px_160px_160px_160px]">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-[var(--radius-soft)] bg-[var(--ink-50)] dark:bg-[var(--ink-900)]/40" />
          ))}
        </div>
      </section>
      <section>
        <div className="mb-3 h-6 w-28 animate-pulse rounded bg-[var(--ink-100)] dark:bg-[var(--ink-900)]/50" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="min-h-[360px] animate-pulse rounded-[var(--radius-soft)] border border-[var(--ink-900)]/10 bg-[var(--paper-50)] dark:border-[var(--ink-200)]/10 dark:bg-slate-950">
              <div className="aspect-[4/3] rounded-t-lg bg-[var(--ink-50)] dark:bg-[var(--ink-900)]/40" />
              <div className="space-y-3 p-4">
                <div className="h-4 w-24 rounded bg-[var(--ink-100)] dark:bg-[var(--ink-900)]" />
                <div className="h-5 w-32 rounded bg-[var(--paper-100)] dark:bg-slate-800" />
                <div className="h-3 w-full rounded bg-[var(--paper-100)] dark:bg-slate-800" />
                <div className="h-3 w-4/5 rounded bg-[var(--paper-100)] dark:bg-slate-800" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export function PhetSimBrowserLoader() {
  return <PhetSimBrowser />
}
