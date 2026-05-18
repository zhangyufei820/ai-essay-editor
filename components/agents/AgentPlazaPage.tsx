"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Lock, Sparkles } from "lucide-react"
import { MarketingShell } from "@/components/v2-chrome"
import { BadgeV2 } from "@/components/ui/v2/badge"
import {
  CardV2,
  CardV2Content,
} from "@/components/ui/v2/card"
import { AGENT_GROUPS, AGENT_REGISTRY, listAgentsByGroup } from "@/components/chat/v2/agent-registry"
import type { AgentDefinition } from "@/components/chat/v2/types"
import { cn } from "@/lib/utils"

function agentHref(agent: AgentDefinition) {
  return `/chat/${agent.model}`
}

export function AgentPlazaPage() {
  const agentCount = Object.keys(AGENT_REGISTRY).length

  return (
    <MarketingShell>
      <section className="border-b border-[var(--paper-200)] bg-[var(--paper-50)]">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 md:px-6 md:py-16">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--ink-200)] bg-[var(--paper-100)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-700)] font-[var(--font-sans-v2)]">
              <Sparkles className="size-3.5" aria-hidden="true" />
              沈翔智学智能体广场
            </span>
            <h1 className="mt-5 font-[var(--font-display)] text-[clamp(34px,5vw,56px)] font-black leading-[1.08] text-[var(--ink-900)]">
              选一个智能体，
              <br />
              直接开始你的学习任务。
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-[1.8] text-[var(--ink-600)] font-[var(--font-sans-v2)] sm:text-[17px]">
              作文批改、题目解析、备课、论文写作、图像与音乐创作都放在这里。按任务挑选，比在对话里反复切换更清楚。
            </p>
            <p className="mt-4 text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-500)] font-[var(--font-sans-v2)]">
              全部 {agentCount} 个智能体
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[var(--paper-50)]">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6 md:py-14">
          {AGENT_GROUPS.map((group) => {
            const agents = listAgentsByGroup(group.key)
            if (agents.length === 0) return null

            return (
              <section key={group.key} className="mb-12 last:mb-0">
                <div className="mb-4 flex items-end justify-between gap-4 border-b border-[var(--paper-200)] pb-3">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-500)] font-[var(--font-sans-v2)]">
                      {group.label}
                    </p>
                    <h2 className="mt-1 font-[var(--font-display)] text-[24px] font-bold text-[var(--ink-800)]">
                      {group.label}智能体
                    </h2>
                  </div>
                  <span className="shrink-0 text-[12px] text-[var(--ink-400)] font-[var(--font-mono-v2)]">
                    {agents.length} 个
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {agents.map((agent) => (
                    <AgentCard key={agent.model} agent={agent} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </section>
    </MarketingShell>
  )
}

function AgentCard({ agent }: { agent: AgentDefinition }) {
  const Icon = agent.icon

  return (
    <Link
      href={agentHref(agent)}
      prefetch={false}
      className="group block h-full rounded-[var(--radius-sharp)] outline-none focus-visible:[box-shadow:var(--shadow-focus-ink)]"
    >
      <CardV2 variant="paper" interactive className="h-full overflow-hidden">
        <CardV2Content className="flex h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-soft)]",
                "bg-[var(--ink-50)] text-[var(--ink-700)] transition-colors duration-200",
                "group-hover:bg-[var(--ink-700)] group-hover:text-white"
              )}
            >
              {Icon ? <Icon className="size-5" aria-hidden="true" /> : null}
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              {agent.memberOnly ? (
                <BadgeV2 variant="seal">
                  <Lock className="mr-0.5 size-2.5" aria-hidden="true" />
                  会员
                </BadgeV2>
              ) : null}
              {agent.priceLabel ? <BadgeV2 variant="paper">{agent.priceLabel}</BadgeV2> : null}
            </div>
          </div>

          <div className="min-w-0">
            <h3 className="font-[var(--font-display)] text-[18px] font-bold text-[var(--ink-800)]">
              {agent.name}
            </h3>
            <p className="mt-2 min-h-[44px] text-[13px] leading-[1.7] text-[var(--ink-500)] font-[var(--font-sans-v2)]">
              {agent.description}
            </p>
          </div>

          <span className="mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--ink-700)] font-[var(--font-sans-v2)]">
            进入对话
            <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </CardV2Content>
      </CardV2>
    </Link>
  )
}
