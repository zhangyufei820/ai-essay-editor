"use client"

import { useState } from "react"
import Link from "next/link"
import * as Dialog from "@radix-ui/react-dialog"
import { ArrowRight, FileText, Sparkles, X } from "lucide-react"
import { sampleReport } from "@/lib/sample-report"
import { cn } from "@/lib/utils"

interface SampleReportTriggerProps {
  label: string
  description: string
  className?: string
}

export function SampleReportTrigger({ label, description, className }: SampleReportTriggerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          style={{ width: "calc(100vw - 2rem)", maxWidth: "100%" }}
          className={cn(
            "sx-mobile-action-card group mr-4 flex min-h-[84px] min-w-0 cursor-pointer items-center gap-3 overflow-hidden rounded-lg border border-border bg-white/88 p-3 text-left text-foreground shadow-sm backdrop-blur transition duration-200 hover:border-primary/30 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:mr-0 sm:min-h-[92px] sm:gap-4 sm:p-4",
            className
          )}
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary transition duration-200 group-hover:bg-primary group-hover:text-primary-foreground sm:size-12">
            <Sparkles className="size-5 sm:size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold">{label}</span>
            <span className="mt-1 block text-sm leading-5 text-muted-foreground">
              {description}
            </span>
          </span>
          <ArrowRight className="hidden size-5 shrink-0 transition-transform duration-200 group-hover:translate-x-1 sm:block" />
        </button>
      </Dialog.Trigger>
      <SampleReportDialog />
    </Dialog.Root>
  )
}

export function SampleReportDialog() {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[88svh] w-[min(94vw,760px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl focus:outline-none">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <Dialog.Title className="text-lg font-black leading-7 text-emerald-950 sm:text-xl">
              {sampleReport.title}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-slate-500">
              脱敏示例 · 结构参考真实作文批改输出 · AI 评分 {sampleReport.score}
            </Dialog.Description>
          </div>
          <Dialog.Close className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <X className="size-5" />
            <span className="sr-only">关闭示例报告</span>
          </Dialog.Close>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-900">
              <FileText className="size-4" />
              报告摘要
            </div>
            <p className="mt-2 text-sm leading-7 text-slate-700">{sampleReport.summary}</p>
          </div>

          <section className="mt-5">
            <h3 className="text-sm font-bold text-slate-900">原文摘要</h3>
            <p className="mt-2 rounded-lg bg-slate-50 p-4 text-sm leading-7 text-slate-700">
              {sampleReport.originalExcerpt}
            </p>
          </section>

          <section className="mt-5">
            <h3 className="text-sm font-bold text-slate-900">问题诊断</h3>
            <div className="mt-3 grid gap-3">
              {sampleReport.diagnosis.map((item) => (
                <div key={item.title} className="rounded-lg border border-slate-100 p-4">
                  <div className="text-sm font-semibold text-emerald-900">{item.title}</div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">修改建议</h3>
              <ul className="mt-3 space-y-2">
                {sampleReport.suggestions.map((item) => (
                  <li key={item} className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">训练任务</h3>
              <ul className="mt-3 space-y-2">
                {sampleReport.trainingTasks.map((item) => (
                  <li key={item} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-900">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">
          <Dialog.Close asChild>
            <Link
              href="/chat/standard"
              prefetch={false}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:w-auto"
            >
              立即用我的作文试一次
              <ArrowRight className="size-4" />
            </Link>
          </Dialog.Close>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  )
}
