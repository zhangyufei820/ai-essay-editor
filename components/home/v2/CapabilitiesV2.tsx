/**
 * 🖌 v2 首页 · 能力卡四联
 *
 * 4 张能力卡片，每张代表一个高频学习动作：
 *   - 错题诊断海报  /worksheet-diagnosis
 *   - 智能作文批改  /chat/standard
 *   - 题目解析     /chat/quanquan-math
 *   - 闪卡复习     /flashcards
 *
 * 视觉：paper card + 入场逐个渗出 + hover 朱印浮现
 */

"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowRight,
  ClipboardCheck,
  FileText,
  HelpCircle,
  Layers3,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  CardV2,
  CardV2Content,
} from "@/components/ui/v2/card"
import { BadgeV2 } from "@/components/ui/v2/badge"
import { InkStagger, InkStaggerItem } from "@/components/motion/InkMotion"

interface Capability {
  href: string
  title: string
  description: string
  icon: LucideIcon
  priceLabel: string
  priceTone: "ink" | "seal"
}

const CAPABILITIES: Capability[] = [
  {
    href: "/worksheet-diagnosis",
    title: "错题诊断海报",
    description: "上传试卷图片，AI 归因错题并生成适合家长沟通的训练建议。",
    icon: ClipboardCheck,
    priceLabel: "首次免费",
    priceTone: "seal",
  },
  {
    href: "/chat/standard",
    title: "智能作文批改",
    description: "从结构、表达、立意到修改方向，给出逐段点评。",
    icon: FileText,
    priceLabel: "100 积分/次",
    priceTone: "ink",
  },
  {
    href: "/chat/quanquan-math",
    title: "题目解析",
    description: "拍题或输入题干，获得可复盘的分步讲解。",
    icon: HelpCircle,
    priceLabel: "按字数计费",
    priceTone: "ink",
  },
  {
    href: "/flashcards",
    title: "闪卡复习",
    description: "把知识点沉淀成复习卡片，跟踪掌握状态。",
    icon: Layers3,
    priceLabel: "免费",
    priceTone: "ink",
  },
]

export function CapabilitiesV2() {
  return (
    <section
      data-slot="v2-capabilities"
      className="bg-[var(--paper-50)]"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-16 md:px-6 md:py-24">
        <div className="mb-10 max-w-2xl">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-500)] font-[var(--font-sans-v2)]">
            核心学习场景
          </p>
          <h2 className="mt-2 font-[var(--font-display)] text-[clamp(28px,4vw,40px)] font-bold leading-[1.2] text-[var(--ink-800)]">
            从作文到错题，先解决最常用的 4 件事
          </h2>
          <p className="mt-3 text-[15px] leading-[1.7] text-[var(--ink-500)] font-[var(--font-sans-v2)]">
            围绕每天会遇到的学习任务，把反馈、修改和复习整理成清晰步骤。
          </p>
        </div>

        <InkStagger
          stagger={0.08}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {CAPABILITIES.map((c) => (
            <InkStaggerItem key={c.href}>
              <CapabilityCard {...c} />
            </InkStaggerItem>
          ))}
        </InkStagger>
      </div>
    </section>
  )
}

function CapabilityCard({ href, title, description, icon: Icon, priceLabel, priceTone }: Capability) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={cn(
        "group block h-full outline-none",
        "focus-visible:[box-shadow:var(--shadow-focus-ink)] rounded-[var(--radius-sharp)]"
      )}
    >
      <CardV2 variant="paper" interactive className="relative h-full overflow-hidden">
        {/* 右上价格标签 */}
        <div className="absolute right-3 top-3 z-10">
          <BadgeV2 variant={priceTone === "seal" ? "seal" : "ink"}>{priceLabel}</BadgeV2>
        </div>

        <CardV2Content className="flex flex-col gap-4">
          <div className={cn(
            "inline-flex size-10 items-center justify-center rounded-[var(--radius-soft)]",
            "bg-[var(--ink-50)] text-[var(--ink-700)]",
            "transition-colors duration-200",
            "group-hover:bg-[var(--ink-700)] group-hover:text-white"
          )}>
            <Icon className="size-5" aria-hidden="true" />
          </div>

          <div>
            <h3 className="font-[var(--font-display)] text-[18px] font-bold text-[var(--ink-800)]">
              {title}
            </h3>
            <p className="mt-2 text-[13px] leading-[1.7] text-[var(--ink-500)] font-[var(--font-sans-v2)]">
              {description}
            </p>
          </div>

          <span className="mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--ink-700)] font-[var(--font-sans-v2)]">
            进入使用
            <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </CardV2Content>
      </CardV2>
    </Link>
  )
}
