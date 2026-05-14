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
      <section className="rounded-lg border border-emerald-900/10 bg-white p-4 shadow-sm dark:border-emerald-200/10 dark:bg-slate-950">
        <div className="grid gap-3 lg:grid-cols-[1fr_160px_160px_160px_160px]">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-lg bg-emerald-50 dark:bg-emerald-950/40" />
          ))}
        </div>
      </section>
      <section>
        <div className="mb-3 h-6 w-28 animate-pulse rounded bg-emerald-100 dark:bg-emerald-950/50" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="min-h-[360px] animate-pulse rounded-lg border border-emerald-900/10 bg-white dark:border-emerald-200/10 dark:bg-slate-950">
              <div className="aspect-[4/3] rounded-t-lg bg-emerald-50 dark:bg-emerald-950/40" />
              <div className="space-y-3 p-4">
                <div className="h-4 w-24 rounded bg-emerald-100 dark:bg-emerald-900" />
                <div className="h-5 w-32 rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-3 w-4/5 rounded bg-slate-100 dark:bg-slate-800" />
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
