/**
 * 📝 沈翔智学 - Hero 区域组件
 *
 * 首页首屏聚焦在两个高频学习动作：错题诊断与作文批改。
 */

"use client"

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, ClipboardCheck, FileText, MessageSquare, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

const heroMetrics = [
  { label: "作文逐段批改", value: "结构 / 表达 / 立意" },
  { label: "错题诊断", value: "归因 / 建议 / 训练" },
  { label: "家长反馈", value: "可直接沟通" },
] as const

const heroActions = [
  {
    href: "/worksheet-diagnosis",
    title: "生成错题诊断",
    description: "拍卷子，整理问题和 7 天训练建议",
    icon: ClipboardCheck,
    primary: true,
  },
  {
    href: "/essay",
    title: "开始作文批改",
    description: "上传作文，获得逐段点评和提分建议",
    icon: FileText,
    primary: false,
  },
] as const

const previewItems = [
  "先定位薄弱知识点",
  "再解释为什么错",
  "最后给出可执行训练",
] as const

export function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden bg-[var(--color-surface-warm)]">
      <div className="absolute inset-0 -z-20">
        <Image
          src="/images/design-mode/site-main.jpg"
          alt="学生在校园中交流学习"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
      </div>
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(253,252,250,0.98)_0%,rgba(253,252,250,0.92)_42%,rgba(253,252,250,0.68)_68%,rgba(253,252,250,0.28)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-[var(--color-surface-soft)] to-transparent" />

      <div className="sx-container grid min-h-[calc(100svh-72px)] items-center gap-10 py-12 md:py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,0.58fr)] lg:gap-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
          className="max-w-3xl pt-4"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/85 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm backdrop-blur">
            <ShieldCheck className="h-4 w-4" />
            给学生、家长和老师看的 AI 学习反馈
          </span>

          <h1 className="mt-7 max-w-3xl text-4xl font-black leading-[1.08] text-emerald-950 sm:text-5xl lg:text-6xl">
            拍作文或卷子，
            <span className="block text-primary">马上得到能执行的反馈。</span>
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-8 text-slate-700 md:text-lg">
            沈翔智学把作文批改、错题归因和训练建议收进同一个学习闭环，
            让孩子知道怎么改，也让家长知道接下来怎么陪。
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {heroActions.map((action) => {
              const Icon = action.icon

              return (
                <Link
                  key={action.href}
                  href={action.href}
                  prefetch={false}
                  className={cn(
                    "group flex min-h-[88px] cursor-pointer items-center gap-4 rounded-lg border p-4 shadow-sm transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    action.primary
                      ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border-border bg-white/88 text-foreground backdrop-blur hover:border-primary/30 hover:bg-white"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-12 shrink-0 items-center justify-center rounded-lg border transition duration-200",
                      action.primary
                        ? "border-white/25 bg-white/15"
                        : "border-primary/15 bg-primary/10 text-primary"
                    )}
                  >
                    <Icon className="size-6" />
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
                  <ArrowRight className="size-5 shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
              )
            })}
          </div>

          <div className="mt-8 grid gap-3 border-t border-emerald-950/10 pt-6 sm:grid-cols-3">
            {heroMetrics.map((metric) => (
              <div key={metric.label}>
                <div className="text-sm font-semibold text-emerald-950">{metric.label}</div>
                <div className="mt-1 text-sm text-slate-600">{metric.value}</div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.08, ease: [0.33, 1, 0.68, 1] }}
          className="hidden lg:block"
        >
          <div className="rounded-lg border border-white/70 bg-white/86 p-5 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MessageSquare className="size-5" />
                </span>
                <div>
                  <div className="text-sm font-bold text-emerald-950">AI 反馈预览</div>
                  <div className="text-xs text-slate-500">从问题到训练方案</div>
                </div>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                约 30 秒
              </span>
            </div>

            <div className="space-y-3 py-5">
              {previewItems.map((item, index) => (
                <div key={item} className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{item}</div>
                    <div className="mt-1 h-2 w-48 rounded-full bg-emerald-100" />
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-primary/15 bg-primary/5 p-4">
              <div className="text-sm font-semibold text-emerald-950">输出结果</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                一份适合学生执行、家长能读懂、老师可追踪的反馈清单。
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default HeroSection
