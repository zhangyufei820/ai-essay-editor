/**
 * 📝 沈翔智学 - Hero 区域组件
 *
 * 首页首屏聚焦公开站点转化：上传学习材料，获得可执行反馈。
 */

"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowRight,
  Camera,
  PenLine,
  ShieldCheck,
} from "lucide-react"
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
    href: "/worksheet-diagnosis",
    title: "拍卷诊断错题",
    description: "看薄弱点和训练建议",
    icon: Camera,
    primary: false,
  },
] as const

export function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden bg-[var(--color-surface-warm)]">
      <div className="absolute inset-x-0 top-0 -z-10 h-px bg-border" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-28 bg-gradient-to-t from-[var(--color-surface-soft)] to-transparent" />

      <div className="sx-container grid items-center gap-8 py-8 pb-12 sm:py-10 md:py-14 lg:min-h-[calc(100svh-72px)] lg:grid-cols-1 lg:gap-14">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
          className="max-w-3xl pt-1 sm:pt-2"
        >
          <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--ink-200)] bg-[var(--paper-50)]/85 px-3 py-1.5 text-xs font-semibold text-[var(--ink-700)] shadow-sm backdrop-blur">
            <ShieldCheck className="h-4 w-4" />
            <span className="min-w-0 truncate">面向学生、家长和老师的 AI 学习反馈</span>
          </span>

          <h1 className="mt-6 max-w-3xl text-[1.95rem] font-black leading-[1.12] text-[var(--ink-900)] sm:mt-7 sm:text-5xl lg:text-6xl">
            上传作文或试卷，
            <span className="block text-[var(--ink-700)]">生成看得懂的</span>
            <span className="block text-[var(--ink-700)]">提分报告。</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--ink-700)] sm:leading-8 md:mt-6 md:text-lg">
            <span className="block">上传图片，AI 会整理批改结果。</span>
            <span className="block">修改建议和训练任务也会生成。</span>
            <span className="block">孩子知道怎么改，家长能看懂进展。</span>
          </p>

          <div className="mt-7 grid max-w-full gap-3 sm:mt-8 sm:grid-cols-2">
            {heroActions.map((action) => {
              const Icon = action.icon

              return (
                <Link
                  key={action.href}
                  href={action.href}
                  prefetch={false}
                  style={{ width: "calc(100vw - 2rem)", maxWidth: "100%" }}
                  className={cn(
                    "sx-mobile-action-card group mr-4 flex min-h-[84px] min-w-0 cursor-pointer items-center gap-3 overflow-hidden rounded-[var(--radius-soft)] border p-3 shadow-sm transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-500)] sm:mr-0 sm:min-h-[92px] sm:gap-4 sm:p-4",
                    action.primary
                      ? "border-[var(--ink-500)] bg-[var(--seal-500)] text-white hover:bg-[var(--ink-700)]/90"
                      : "border-[var(--paper-200)] bg-[var(--paper-50)]/88 text-[var(--ink-900)] backdrop-blur hover:border-[var(--ink-300)] hover:bg-[var(--paper-50)]"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-soft)] border transition duration-200 sm:size-12",
                      action.primary
                        ? "border-white/25 bg-[var(--paper-50)]/15"
                        : "border-[var(--ink-100)] bg-[var(--ink-50)] text-[var(--ink-700)]"
                    )}
                  >
                    <Icon className="size-5 sm:size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold">{action.title}</span>
                    <span
                      className={cn(
                        "mt-1 block text-sm leading-5",
                        action.primary ? "text-white/82" : "text-[var(--ink-500)]"
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

          <div className="mt-8 grid gap-4 border-t border-emerald-950/10 pt-6 sm:grid-cols-3">
            {heroMetrics.map((metric) => (
              <div key={metric.label}>
                <div className="text-sm font-semibold text-[var(--ink-900)]">{metric.label}</div>
                <div className="mt-1 text-sm text-[var(--ink-600)]">{metric.value}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default HeroSection
