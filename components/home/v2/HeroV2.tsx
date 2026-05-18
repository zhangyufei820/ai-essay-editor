/**
 * 🖌 沈翔智学 v2 首页 · Hero 区
 *
 * 叙事："上传作文 / 试卷 / 错题。看见能拿走的报告。"
 *
 * 桌面端布局：
 *   ┌──────────────────────────┬──────────────┐
 *   │  ShieldCheck 信誉徽章     │   报告示例   │
 *   │  text-hero 标题（宋体）   │   占位卡片   │
 *   │  正文段落                  │              │
 *   │  [上传作文批改] [看一份示例]│             │
 *   │  3 个 metric              │              │
 *   └──────────────────────────┴──────────────┘
 *
 * 移动端：单列堆叠，右侧报告卡片 hidden
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Blocks, FileText, ShieldCheck, Sparkles, PenLine } from "lucide-react"
import { ButtonV2 } from "@/components/ui/v2/button"
import { ScoreSeal } from "@/components/ui/v2/seal"
import { InkReveal } from "@/components/motion/InkMotion"
import { cn } from "@/lib/utils"

const HERO_METRICS = [
  { label: "上传材料", value: "作文 / 试卷 / 错题" },
  { label: "AI 完整反馈", value: "批改 / 归因 / 建议" },
  { label: "下一步行动", value: "订正 / 训练 / 复盘" },
] as const

export function HeroV2() {
  return (
    <section
      data-slot="v2-hero"
      className={cn(
        "relative isolate overflow-hidden",
        "bg-[var(--paper-50)]",
        "border-b border-[var(--paper-200)]"
      )}
    >
      {/* 装饰：右上角宣纸纹理 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(circle at 80% 0%, rgba(63, 90, 66, 0.04) 0%, transparent 60%)," +
            "radial-gradient(circle at 0% 100%, rgba(178, 58, 44, 0.03) 0%, transparent 50%)",
        }}
      />

      <div className="mx-auto box-border grid w-full max-w-7xl items-center gap-10 px-4 py-10 md:px-6 md:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] lg:gap-16 lg:py-24">
        {/* 左侧：文字 + CTA */}
        <InkReveal as="div" className="max-w-2xl">
          {/* 信誉徽章 */}
          <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--ink-200)] bg-[var(--paper-100)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-700)] font-[var(--font-sans-v2)]">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            面向学生、家长、老师的 AI 学习反馈
          </span>

          {/* Hero 大标题 — 宋体 */}
          <h1 className="mt-6 font-[var(--font-display)] text-[clamp(36px,6vw,72px)] font-black leading-[1.05] tracking-[-0.02em] text-[var(--ink-900)]">
            上传作文。
            <br />
            <span className="text-[var(--ink-700)]">看见</span>
            <span className="relative inline-block">
              <span className="text-[var(--seal-500)]">能拿走</span>
              {/* 朱印小印章在"能拿走"末尾右上 */}
              <span
                aria-hidden="true"
                className="absolute -right-2 -top-2 size-3 rounded-full bg-[var(--seal-500)] opacity-80"
              />
            </span>
            <span className="text-[var(--ink-700)]">的报告。</span>
          </h1>

          {/* 副文案 */}
          <p className="mt-6 max-w-xl text-[15px] leading-[1.8] text-[var(--ink-600)] font-[var(--font-sans-v2)] sm:text-[17px]">
            拍一张作文或试卷，60 秒生成可读、可改、可分享的报告。
            <br className="hidden sm:block" />
            孩子知道怎么改、家长能看懂进展、老师省半小时备课。
          </p>

          {/* 双 CTA */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <ButtonV2 asChild variant="primary" size="lg" className="group box-border w-full sm:w-auto">
              <Link href="/chat/standard" prefetch={false}>
                <PenLine className="size-4" aria-hidden="true" />
                上传作文批改
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </ButtonV2>

            <ButtonV2 asChild variant="outline" size="lg" className="box-border w-full sm:w-auto">
              <Link href="/agents" prefetch={false}>
                <Blocks className="size-4" aria-hidden="true" />
                智能体广场
              </Link>
            </ButtonV2>
          </div>

          {/* 三段 metric */}
          <ul className="mt-10 grid gap-4 border-t border-[var(--paper-200)] pt-6 sm:grid-cols-3">
            {HERO_METRICS.map((m) => (
              <li key={m.label}>
                <div className="font-[var(--font-sans-v2)] text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-500)]">
                  {m.label}
                </div>
                <div className="mt-1 font-[var(--font-display)] text-[15px] font-bold text-[var(--ink-800)]">
                  {m.value}
                </div>
              </li>
            ))}
          </ul>
        </InkReveal>

        {/* 右侧：报告卡片预览 */}
        <InkReveal
          as="div"
          delay={0.15}
          className="hidden lg:block"
        >
          <ReportPreview />
        </InkReveal>
      </div>
    </section>
  )
}

/**
 * 报告示例卡 — 模拟一份真实批改稿
 * （待 PR4 真实截图替换）
 */
function ReportPreview() {
  return (
    <div className="relative">
      {/* 主卡 */}
      <div
        className={cn(
          "relative aspect-[4/5] w-full overflow-hidden",
          "rounded-[var(--radius-card)] bg-white",
          "shadow-[var(--shadow-modal)] border border-[var(--paper-200)]"
        )}
      >
        {/* 顶部装饰 */}
        <div className="border-b border-[var(--paper-200)] bg-[var(--paper-50)] px-5 py-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-500)] font-[var(--font-sans-v2)]">
            <FileText className="size-3.5" />
            作文批改报告 · 已脱敏示例
          </div>
        </div>

        {/* 报告内容 */}
        <div className="px-6 pt-5 pb-8">
          <h3 className="font-[var(--font-display)] text-[22px] font-black text-[var(--ink-800)]">
            《我的妈妈》
          </h3>
          <p className="mt-1 text-[12px] text-[var(--ink-500)] font-[var(--font-sans-v2)]">
            五年级 · 750 字
          </p>

          {/* 评分朱印 */}
          <div className="mt-5 flex items-center gap-4">
            <ScoreSeal score="8.5" total="10" size={72} />
            <div>
              <div className="font-[var(--font-display)] text-[14px] font-bold text-[var(--ink-800)]">
                内容真实，结构待加强
              </div>
              <div className="text-[12px] text-[var(--ink-500)] mt-1 font-[var(--font-sans-v2)]">
                AI 已整理 · 6 处问题 · 3 条建议
              </div>
            </div>
          </div>

          {/* 模拟批改条目 */}
          <div className="mt-6 space-y-3">
            <PreviewRow label="原文问题" content="开头观点出现得稍晚" />
            <PreviewRow label="AI 修改" content="先点明立意，再补一处生活细节" />
            <PreviewRow label="训练任务" content="重写开头 + 3 句表达替换" />
          </div>
        </div>

        {/* 底部水印 */}
        <div className="absolute bottom-3 right-4 font-[var(--font-display)] text-[10px] text-[var(--ink-300)] tracking-widest">
          沈翔智学
        </div>
      </div>

      {/* 朱印悬浮装饰 */}
      <div
        className="absolute -right-3 -top-4 hidden lg:block"
        aria-hidden="true"
        style={{ transform: "rotate(8deg)" }}
      >
        <span
          className={cn(
            "inline-flex items-center justify-center size-12 rounded-sm border-2",
            "border-[var(--seal-500)] bg-[var(--seal-50)]/80",
            "font-[var(--font-display)] text-[10px] font-bold text-[var(--seal-500)]",
            "shadow-[0_2px_0_var(--seal-500)]"
          )}
          style={{ writingMode: "vertical-rl", letterSpacing: "0.2em" }}
        >
          已批阅
        </span>
      </div>
    </div>
  )
}

function PreviewRow({ label, content }: { label: string; content: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-soft)] bg-[var(--paper-100)] px-3 py-2.5">
      <Sparkles className="mt-0.5 size-3 shrink-0 text-[var(--seal-500)]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-500)] font-[var(--font-sans-v2)]">
          {label}
        </div>
        <div className="mt-0.5 text-[13px] leading-[1.6] text-[var(--ink-800)] font-[var(--font-sans-v2)]">
          {content}
        </div>
      </div>
    </div>
  )
}
