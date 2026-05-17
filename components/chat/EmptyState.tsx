"use client"

import Link from "next/link"
import { PenLine, Camera, Calculator, Award, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { InkReveal, InkStagger, InkStaggerItem } from "@/components/motion/InkMotion"

const QUICK_AGENTS = [
  { href: "/chat/standard", icon: PenLine, name: "作文批改", desc: "逐段点评 + 升格", price: "100积分/次" },
  { href: "/worksheet-diagnosis", icon: Camera, name: "拍卷诊断", desc: "错题归因 + 海报", price: "首次免费" },
  { href: "/chat/quanquan-math", icon: Calculator, name: "数学解题", desc: "分步讲解", price: "20积分起" },
  { href: "/chat/all-in-one-agent", icon: Award, name: "全能智能体", desc: "自动选择工具", price: "按token" },
] as const

const MORE_AGENTS = [
  { group: "写作", items: ["论文", "中英作文", "留学文书", "简历", "演讲", "校园文案"] },
  { group: "学科", items: ["英语", "词境记忆卡", "题目解析"] },
  { group: "创作", items: ["GPT Image", "Banana 4K", "Suno 音乐", "OpenClaw"] },
  { group: "教学", items: ["备课 Pro", "班主任", "教学评"] },
] as const

const PROMPTS = [
  "帮我批改这篇 800 字作文",
  "这道几何题怎么做",
  "生成 10 张四级词汇闪卡",
] as const

interface EmptyStateProps {
  onSelectPrompt?: (prompt: string) => void
  onSuggestionClick?: (prompt: string) => void
  className?: string
}

export function EmptyState({ onSelectPrompt, onSuggestionClick, className }: EmptyStateProps) {
  const handleSelectPrompt = (prompt: string) => {
    onSelectPrompt?.(prompt)
    onSuggestionClick?.(prompt)
  }

  return (
    <div className={cn("mx-auto box-border w-full max-w-3xl px-4 py-12 md:py-20", className)}>
      <InkReveal as="div" className="text-center mb-10">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[var(--ink-50)] text-[var(--ink-600)]">
          <PenLine className="size-6" />
        </div>
        <h2 className="font-[var(--font-display)] text-[24px] font-bold text-[var(--ink-800)]">
          上传材料，看见报告
        </h2>
        <p className="mt-2 text-[14px] text-[var(--ink-500)] font-[var(--font-sans-v2)]">
          选择一个智能体开始对话
        </p>
      </InkReveal>

      <InkStagger stagger={0.06} className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-8">
        {QUICK_AGENTS.map((agent) => (
          <InkStaggerItem key={agent.href}>
            <Link
              href={agent.href}
              prefetch={false}
              className={cn(
                "group flex flex-col items-center gap-2 p-4 text-center",
                "rounded-[var(--radius-card)] border border-[var(--paper-200)]",
                "bg-white shadow-[var(--shadow-paper)]",
                "transition-all duration-200",
                "hover:border-[var(--ink-300)] hover:shadow-[var(--shadow-elevated)] hover:-translate-y-[1px]",
                "focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus-ink)]"
              )}
            >
              <div
                className={cn(
                  "flex size-10 items-center justify-center rounded-full",
                  "bg-[var(--ink-50)] text-[var(--ink-600)]",
                  "transition-colors duration-200",
                  "group-hover:bg-[var(--ink-600)] group-hover:text-white"
                )}
              >
                <agent.icon className="size-5" />
              </div>
              <div className="font-[var(--font-display)] text-[14px] font-bold text-[var(--ink-800)]">
                {agent.name}
              </div>
              <div className="text-[11px] text-[var(--ink-500)] font-[var(--font-sans-v2)]">
                {agent.desc}
              </div>
              <div className="text-[10px] text-[var(--ink-400)] font-[var(--font-mono-v2)]">
                {agent.price}
              </div>
            </Link>
          </InkStaggerItem>
        ))}
      </InkStagger>

      <InkReveal as="div" delay={0.12} className="mb-8 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-400)] mb-3">
          更多智能体
        </p>
        <div className="space-y-1.5">
          {MORE_AGENTS.map((g) => (
            <div key={g.group} className="text-[13px] text-[var(--ink-600)] font-[var(--font-sans-v2)]">
              <span className="font-semibold text-[var(--ink-700)]">{g.group}：</span>
              {g.items.join(" · ")}
            </div>
          ))}
        </div>
      </InkReveal>

      <InkReveal as="div" delay={0.16}>
        <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-400)] mb-3 text-center">
          试试这样说
        </p>
        <div className="flex flex-col gap-2">
          {PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handleSelectPrompt(p)}
              className={cn(
                "group flex items-center gap-3 px-4 py-3 text-left",
                "rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)]",
                "font-[var(--font-sans-v2)] text-[14px] text-[var(--ink-700)]",
                "transition-colors duration-200",
                "hover:bg-[var(--ink-50)] hover:border-[var(--ink-300)]"
              )}
            >
              <span className="flex-1">"{p}"</span>
              <ChevronRight className="size-4 text-[var(--ink-400)] transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      </InkReveal>
    </div>
  )
}

export default EmptyState
