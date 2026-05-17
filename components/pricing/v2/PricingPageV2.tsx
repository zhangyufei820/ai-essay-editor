/**
 * 🖌 v2 套餐与价格页
 *
 * 视觉：三张 paper card 并排（基础 / 专业 / 豪华）+ 底部 FAQ 折叠
 *       当前方案用朱印"推荐"标记
 */

"use client"

import * as React from "react"
import Link from "next/link"
import { Check, Crown } from "lucide-react"
import { cn } from "@/lib/utils"
import { ButtonV2 } from "@/components/ui/v2/button"
import { CardV2, CardV2Content, CardV2Header, CardV2Title } from "@/components/ui/v2/card"
import { BadgeV2 } from "@/components/ui/v2/badge"
import { SealStamp } from "@/components/ui/v2/seal"
import { InkReveal, InkStagger, InkStaggerItem } from "@/components/motion/InkMotion"

interface Plan {
  id: string
  name: string
  price: string
  period: string
  credits: string
  features: string[]
  recommended?: boolean
  cta: string
}

const PLANS: Plan[] = [
  {
    id: "basic",
    name: "基础版",
    price: "¥28",
    period: "/ 月",
    credits: "2,000 积分/月",
    features: ["全部 22 个智能体", "作文批改 + 错题诊断", "历史记录保留"],
    cta: "开始使用",
  },
  {
    id: "pro",
    name: "专业版",
    price: "¥68",
    period: "/ 月",
    credits: "5,000 积分/月",
    features: ["包含基础版所有功能", "GPT Image 2 (4K)", "闪卡无限生成", "优先响应"],
    recommended: true,
    cta: "升级专业版",
  },
  {
    id: "premium",
    name: "豪华版",
    price: "¥128",
    period: "/ 月",
    credits: "12,000 积分/月",
    features: ["包含专业版所有功能", "教师智能体", "自定义 Prompt", "数据导出", "专属客服"],
    cta: "升级豪华版",
  },
]

export interface PricingPageV2Props {
  currentPlan?: string
  className?: string
}

export function PricingPageV2({ currentPlan, className }: PricingPageV2Props) {
  return (
    <div
      data-slot="v2-pricing-page"
      className={cn("mx-auto box-border w-full max-w-6xl overflow-hidden px-4 py-10 md:px-6 md:py-20 font-[var(--font-sans-v2)]", className)}
    >
      <InkReveal as="header" className="text-center mb-12">
        <h1 className="font-[var(--font-display)] text-[clamp(32px,5vw,48px)] font-black leading-[1.1] text-[var(--ink-800)]">
          选择适合你的方案
        </h1>
        <p className="mx-auto mt-3 max-w-full px-1 text-[15px] leading-[1.7] text-[var(--ink-600)] break-words sm:max-w-lg">
          所有方案包含 22 个智能体。按月计费，随时取消。年付享 8 折。
        </p>
      </InkReveal>

      <InkStagger stagger={0.1} className="grid min-w-0 gap-6 md:grid-cols-3">
        {PLANS.map((plan) => (
          <InkStaggerItem key={plan.id}>
            <PlanCard plan={plan} isCurrent={currentPlan === plan.id} />
          </InkStaggerItem>
        ))}
      </InkStagger>
    </div>
  )
}

function PlanCard({ plan, isCurrent }: { plan: Plan; isCurrent?: boolean }) {
  return (
    <CardV2
      variant={plan.recommended ? "elevated" : "paper"}
      className={cn(
        "relative h-full min-w-0",
        plan.recommended && "ring-2 ring-[var(--seal-500)] ring-offset-2 ring-offset-[var(--paper-50)]"
      )}
    >
      {plan.recommended ? (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <SealStamp size="sm" orientation="horizontal" rotate={-2}>推荐</SealStamp>
        </div>
      ) : null}

      <CardV2Header className="text-center pt-8">
        <CardV2Title className="text-[var(--ink-800)]">{plan.name}</CardV2Title>
        <div className="mt-2 flex items-baseline justify-center gap-1">
          <span className="font-[var(--font-display)] text-[36px] font-black text-[var(--ink-800)]">
            {plan.price}
          </span>
          <span className="text-[14px] text-[var(--ink-500)]">{plan.period}</span>
        </div>
        <BadgeV2 variant="ink" className="mt-2">{plan.credits}</BadgeV2>
      </CardV2Header>

      <CardV2Content className="flex-1">
        <ul className="space-y-3">
          {plan.features.map((f, idx) => (
            <li key={idx} className="flex items-start gap-2 text-[14px] text-[var(--ink-700)]">
              <Check className="mt-0.5 size-4 shrink-0 text-[var(--ink-600)]" />
              {f}
            </li>
          ))}
        </ul>
      </CardV2Content>

      <div className="px-5 pb-6 sm:px-6">
        {isCurrent ? (
          <ButtonV2 variant="outline" size="lg" className="box-border w-full" disabled>
            <Crown className="size-4" />
            当前方案
          </ButtonV2>
        ) : (
          <ButtonV2
            asChild
            variant={plan.recommended ? "seal" : "primary"}
            size="lg"
            className="box-border w-full"
          >
            <Link href={`/checkout/${plan.id}`} prefetch={false}>
              {plan.cta}
            </Link>
          </ButtonV2>
        )}
      </div>
    </CardV2>
  )
}
