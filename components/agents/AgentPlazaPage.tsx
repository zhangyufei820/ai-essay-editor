"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Compass, Lock, Sparkles } from "lucide-react"
import { MarketingShell } from "@/components/v2-chrome"
import { ModelLogo, type ModelKey } from "@/components/ModelLogo"
import { BadgeV2 } from "@/components/ui/v2/badge"
import { CardV2, CardV2Content } from "@/components/ui/v2/card"
import { AGENT_GROUPS, AGENT_REGISTRY, listAgentsByGroup } from "@/components/chat/v2/agent-registry"
import type { AgentDefinition } from "@/components/chat/v2/types"
import { cn } from "@/lib/utils"

const HIDDEN_FROM_PLAZA = new Set(["gpt-image-1"])

const MODEL_SHORTCUTS: Array<{
  key: ModelKey
  name: string
  description: string
  href: string
  badge?: string
}> = [
  {
    key: "gpt-5",
    name: "ChatGPT 5.4",
    description: "通用推理、写作和复杂问题拆解",
    href: "/chat/gpt-5",
    badge: "新",
  },
  {
    key: "claude-opus",
    name: "Claude Opus",
    description: "长文理解、结构分析和严谨润色",
    href: "/chat/claude-opus",
  },
  {
    key: "gemini-pro",
    name: "Gemini Pro",
    description: "多模态理解、资料整理和快速问答",
    href: "/chat/gemini-pro",
  },
  {
    key: "grok-4.2",
    name: "Grok 4.2",
    description: "开放式探索、灵感发散和实时型提问",
    href: "/chat/grok-4.2",
  },
]

function agentHref(agent: AgentDefinition) {
  return `/chat/${agent.model}`
}

function plazaAgents(group: AgentDefinition["group"]) {
  return listAgentsByGroup(group).filter((agent) => !HIDDEN_FROM_PLAZA.has(agent.model))
}

export function AgentPlazaPage() {
  const visibleAgentCount = Object.values(AGENT_REGISTRY).filter((agent) => !HIDDEN_FROM_PLAZA.has(agent.model)).length
  const generalAgents = plazaAgents("general")
  const otherGroups = AGENT_GROUPS.filter((group) => group.key !== "general")

  return (
    <MarketingShell>
      <section className="relative overflow-hidden border-b border-[var(--paper-200)] bg-[linear-gradient(180deg,var(--paper-50)_0%,var(--ink-50)_100%)]">
        <div className="absolute inset-x-0 bottom-0 h-px bg-[var(--ink-200)]/50" aria-hidden="true" />
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 md:px-6 md:py-16 lg:grid-cols-[1.08fr_0.92fr] lg:items-end">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--ink-200)] bg-[var(--paper-50)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-700)] shadow-[var(--shadow-paper)] font-[var(--font-sans-v2)]">
              <Sparkles className="size-3.5" aria-hidden="true" />
              沈翔智学智能体广场
            </span>
            <h1 className="mt-5 max-w-3xl font-[var(--font-display)] text-[clamp(34px,5vw,58px)] font-black leading-[1.06] text-[var(--ink-900)]">
              按任务选择智能体，
              <br />
              让学习和创作直接进入状态。
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-[1.85] text-[var(--ink-600)] font-[var(--font-sans-v2)] sm:text-[17px]">
              写作、学科讲解、教学准备、图像音乐创作和顶级模型都在同一个入口。你只需要选任务，系统会把合适的能力带到对话里。
            </p>
          </div>

          <div className="rounded-[var(--radius-sharp)] border border-[var(--ink-200)] bg-[var(--paper-50)] p-4 shadow-[0_24px_80px_rgba(16,55,35,0.13)]">
            <div className="flex items-center justify-between border-b border-[var(--paper-200)] pb-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-500)] font-[var(--font-sans-v2)]">
                  快速入口
                </p>
                <h2 className="mt-1 font-[var(--font-display)] text-[20px] font-bold text-[var(--ink-800)]">
                  {visibleAgentCount} 个可用智能体
                </h2>
              </div>
              <Compass className="size-5 text-[var(--ink-500)]" aria-hidden="true" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-[12px] text-[var(--ink-600)] font-[var(--font-sans-v2)]">
              {AGENT_GROUPS.map((group) => {
                const count = plazaAgents(group.key).length
                if (!count) return null
                return (
                  <a
                    key={group.key}
                    href={`#agent-group-${group.key}`}
                    className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-100)] px-3 py-2 font-semibold transition-colors hover:border-[var(--ink-300)] hover:bg-[var(--ink-50)]"
                  >
                    {group.label} · {count}
                  </a>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[var(--paper-50)]">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6 md:py-14">
          <section id="agent-group-general" className="mb-12">
            <SectionHeading label="通用" title="网站助手与独立模型" count={generalAgents.length + MODEL_SHORTCUTS.length} />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {generalAgents.map((agent) => (
                  <AgentCard key={agent.model} agent={agent} featured={agent.model === "general-chat"} />
                ))}
              </div>
              <CardV2 variant="paper" className="overflow-hidden border-[var(--ink-200)] bg-[linear-gradient(180deg,var(--paper-50),var(--ink-50))]">
                <CardV2Content className="flex h-full flex-col gap-4">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-500)] font-[var(--font-sans-v2)]">
                      独立模型
                    </p>
                    <h3 className="mt-1 font-[var(--font-display)] text-[22px] font-bold text-[var(--ink-800)]">
                      直接调用四个顶级模型
                    </h3>
                    <p className="mt-2 text-[13px] leading-[1.7] text-[var(--ink-500)] font-[var(--font-sans-v2)]">
                      适合不想先选任务模板，只想进入模型原生对话的场景。
                    </p>
                  </div>
                  <div className="grid gap-2">
                    {MODEL_SHORTCUTS.map((model) => (
                      <ModelShortcut key={model.key} model={model} />
                    ))}
                  </div>
                </CardV2Content>
              </CardV2>
            </div>
          </section>

          {otherGroups.map((group) => {
            const agents = plazaAgents(group.key)
            if (agents.length === 0) return null

            return (
              <section id={`agent-group-${group.key}`} key={group.key} className="mb-12 scroll-mt-24 last:mb-0">
                <SectionHeading label={group.label} title={`${group.label}智能体`} count={agents.length} />
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

function SectionHeading({ label, title, count }: { label: string; title: string; count: number }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 border-b border-[var(--paper-200)] pb-3">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-500)] font-[var(--font-sans-v2)]">
          {label}
        </p>
        <h2 className="mt-1 font-[var(--font-display)] text-[24px] font-bold text-[var(--ink-800)]">
          {title}
        </h2>
      </div>
      <span className="shrink-0 text-[12px] text-[var(--ink-400)] font-[var(--font-mono-v2)]">
        {count} 个
      </span>
    </div>
  )
}

function AgentCard({ agent, featured = false }: { agent: AgentDefinition; featured?: boolean }) {
  const Icon = agent.icon
  const hasModelLogo = [
    "general-chat",
    "banana-2-pro",
    "gpt-image-2",
    "suno-v5",
    "open-claw",
    "all-in-one-agent",
  ].includes(agent.model)

  return (
    <Link
      href={agentHref(agent)}
      prefetch={false}
      className="group block h-full rounded-[var(--radius-sharp)] outline-none focus-visible:[box-shadow:var(--shadow-focus-ink)]"
    >
      <CardV2
        variant="paper"
        interactive
        className={cn(
          "h-full overflow-hidden",
          featured ? "border-[var(--ink-300)] bg-[linear-gradient(180deg,var(--ink-50),var(--paper-50))]" : ""
        )}
      >
        <CardV2Content className="flex h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-soft)]",
                "border border-[var(--paper-200)] bg-[var(--paper-100)] text-[var(--ink-700)] transition-colors duration-200",
                "group-hover:border-[var(--ink-300)] group-hover:bg-[var(--ink-50)]"
              )}
            >
              {hasModelLogo ? (
                <ModelLogo modelKey={agent.model as ModelKey} size="md" />
              ) : Icon ? (
                <Icon className="size-5" aria-hidden="true" />
              ) : null}
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

function ModelShortcut({ model }: { model: (typeof MODEL_SHORTCUTS)[number] }) {
  return (
    <Link
      href={model.href}
      prefetch={false}
      className="group flex items-center gap-3 rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-3 outline-none transition-all hover:border-[var(--ink-300)] hover:bg-[var(--paper-100)] focus-visible:[box-shadow:var(--shadow-focus-ink)]"
    >
      <ModelLogo modelKey={model.key} size="lg" showBg />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-[var(--font-display)] text-[15px] font-bold text-[var(--ink-800)]">
          {model.name}
          {model.badge ? <BadgeV2 variant="seal">{model.badge}</BadgeV2> : null}
        </span>
        <span className="mt-1 block text-[12px] leading-[1.5] text-[var(--ink-500)] font-[var(--font-sans-v2)]">
          {model.description}
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-[var(--ink-400)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  )
}
