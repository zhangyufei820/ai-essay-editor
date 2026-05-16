/**
 * 📝 沈翔智学 - Hero 区域组件
 *
 * 首页首屏聚焦公开站点转化：上传学习材料，获得可执行反馈。
 */

import Link from "next/link"
import {
  ArrowRight,
  BookOpenCheck,
  Camera,
  CheckCircle2,
  FileText,
  PenLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import { FadeIn } from "@/components/motion/FadeIn"
import { SampleReportTrigger } from "@/components/home/SampleReportDialog"
import { cn } from "@/lib/utils"

const heroMetrics = [
  { label: "上传材料", value: "作文 / 试卷 / 错题" },
  { label: "AI 完整反馈", value: "批改 / 归因 / 建议" },
  { label: "下一步行动", value: "订正 / 训练 / 复盘" },
] as const

const heroActions = [
  {
    href: "/chat/standard",
    title: "上传作文批改",
    description: "逐段点评，保留原文",
    icon: PenLine,
    primary: true,
  },
  {
    title: "看一份示例",
    description: "免登录预览效果",
    icon: Sparkles,
    primary: false,
  },
] as const

const quickLinks = [
  {
    href: "/worksheet-diagnosis",
    title: "拍卷诊断错题",
  },
] as const

const feedbackRows = [
  { label: "原文问题", value: "中心句出现太晚，开头缺少明确观点" },
  { label: "AI 修改", value: "先点明立意，再补充一处生活细节" },
  { label: "训练建议", value: "今天完成 1 段开头重写和 3 句表达替换" },
] as const

export function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden bg-[var(--color-surface-warm)]">
      <div className="absolute inset-x-0 top-0 -z-10 h-px bg-border" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-28 bg-gradient-to-t from-[var(--color-surface-soft)] to-transparent" />

      <div className="sx-container grid items-center gap-8 py-8 pb-12 sm:py-10 md:py-14 lg:min-h-[calc(100svh-72px)] lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.62fr)] lg:gap-14">
        <FadeIn className="max-w-3xl pt-1 sm:pt-2">
          <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary/20 bg-white/85 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm backdrop-blur">
            <ShieldCheck className="h-4 w-4" />
            <span className="min-w-0 truncate">面向学生、家长和老师的 AI 学习反馈</span>
          </span>

          <h1 className="mt-6 max-w-3xl text-[1.95rem] font-black leading-[1.12] text-emerald-950 sm:mt-7 sm:text-5xl lg:text-6xl">
            上传作文或试卷，
            <span className="block text-primary">生成看得懂的</span>
            <span className="block text-primary">提分报告。</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-700 sm:leading-8 md:mt-6 md:text-lg">
            <span className="block">上传图片，AI 会整理批改结果。</span>
            <span className="block">修改建议和训练任务也会生成。</span>
            <span className="block">孩子知道怎么改，家长能看懂进展。</span>
          </p>

          <div className="mt-7 grid max-w-full gap-3 sm:mt-8 sm:grid-cols-2">
            {heroActions.map((action) => {
              const Icon = action.icon

              if (!("href" in action)) {
                return (
                  <SampleReportTrigger
                    key={action.title}
                    label={action.title}
                    description={action.description}
                  />
                )
              }

              return (
                <Link
                  key={action.href}
                  href={action.href}
                  prefetch={false}
                  style={{ width: "calc(100vw - 2rem)", maxWidth: "100%" }}
                  className={cn(
                    "sx-mobile-action-card group mr-4 flex min-h-[84px] min-w-0 cursor-pointer items-center gap-3 overflow-hidden rounded-lg border p-3 shadow-sm transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:mr-0 sm:min-h-[92px] sm:gap-4 sm:p-4",
                    action.primary
                      ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border-border bg-white/88 text-foreground backdrop-blur hover:border-primary/30 hover:bg-white"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-lg border transition duration-200 sm:size-12",
                      action.primary
                        ? "border-white/25 bg-white/15"
                        : "border-primary/15 bg-primary/10 text-primary"
                    )}
                  >
                    <Icon className="size-5 sm:size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold">{action.title}</span>
                    <span
                      className={cn(
                        "mt-1 block text-sm leading-5",
                        action.primary ? "text-white/82" : "text-muted-foreground"
                      )}
                    >
                      {action.description}
                    </span>
                  </span>
                  <ArrowRight className="hidden size-5 shrink-0 transition-transform duration-200 group-hover:translate-x-1 sm:block" />
                </Link>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="font-semibold text-emerald-950">快捷入口</span>
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                prefetch={false}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-950/10 bg-white/72 px-3 py-1.5 font-medium text-slate-700 transition hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {link.title}
                <ArrowRight className="size-3.5" />
              </Link>
            ))}
          </div>

          <div className="mt-8 grid gap-4 border-t border-emerald-950/10 pt-6 sm:grid-cols-3">
            {heroMetrics.map((metric) => (
              <div key={metric.label}>
                <div className="text-sm font-semibold text-emerald-950">{metric.label}</div>
                <div className="mt-1 text-sm text-slate-600">{metric.value}</div>
              </div>
            ))}
          </div>
        </FadeIn>

        <FadeIn y={24} delay={0.08} className="hidden lg:block">
          <div className="rounded-2xl border border-white/70 bg-white/88 p-5 shadow-xl backdrop-blur">
            <div className="overflow-hidden rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cream-50 p-5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-primary shadow-sm">
                  <Sparkles className="size-3.5" />
                  完整学习报告预览
                </span>
                <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
                  AI 已整理
                </span>
              </div>

              <div className="mt-5 grid grid-cols-[0.78fr_1fr] gap-4">
                <div className="rounded-lg border border-emerald-100 bg-white p-3 shadow-sm">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <Camera className="size-4 text-primary" />
                    上传原图
                  </div>
                  <div className="space-y-2">
                    <div className="h-2.5 rounded-full bg-slate-200" />
                    <div className="h-2.5 w-10/12 rounded-full bg-slate-200" />
                    <div className="h-2.5 w-11/12 rounded-full bg-slate-200" />
                    <div className="h-2.5 w-8/12 rounded-full bg-slate-200" />
                  </div>
                  <div className="mt-4 h-16 rounded-md border border-dashed border-emerald-200 bg-emerald-50/70" />
                </div>

                <div className="rounded-lg border border-emerald-100 bg-white p-3 shadow-sm">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <PenLine className="size-4 text-primary" />
                    修改后内容
                  </div>
                  <h2 className="text-lg font-bold leading-tight text-emerald-950">
                    从图片上传到修改稿，一屏读完
                  </h2>
                  <div className="mt-3 space-y-2">
                    <div className="h-2 rounded-full bg-emerald-200" />
                    <div className="h-2 w-11/12 rounded-full bg-emerald-100" />
                    <div className="h-2 w-9/12 rounded-full bg-emerald-100" />
                  </div>
                  <div className="mt-4 rounded-md bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                    已生成可阅读排版
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpenCheck className="size-5" />
                </span>
                <div>
                  <div className="text-sm font-bold text-emerald-950">作文批改报告</div>
                  <div className="text-xs text-slate-500">原图、原文、修改版都保留</div>
                </div>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                完整排版
              </span>
            </div>

            <div className="space-y-3 py-5">
              {feedbackRows.map((item) => (
                <div key={item.label} className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <CheckCircle2 className="size-4" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                    <div className="mt-1 text-sm leading-6 text-slate-600">{item.value}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-primary/15 bg-primary/5 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
                <FileText className="size-4 text-primary" />
                清晰报告，适合阅读和分享
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                展示上传图片和 AI 修改后的完整内容，适合阅读、收藏和分享。
              </p>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

export default HeroSection
