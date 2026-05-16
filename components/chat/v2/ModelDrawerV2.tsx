/**
 * 🖌 v2 智能体抽屉式选择器
 *
 * 不是 dropdown — 是一份真正的"画廊"。
 * 视觉：墨绿底 + 朱印章高亮当前选中智能体。
 */

"use client"

import * as React from "react"
import { Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  SheetV2,
  SheetV2Content,
  SheetV2Trigger,
  SheetV2Header,
  SheetV2Title,
  SheetV2Description,
} from "@/components/ui/v2/sheet"
import { BadgeV2 } from "@/components/ui/v2/badge"
import { AGENT_GROUPS, AGENT_REGISTRY, listAgentsByGroup } from "./agent-registry"
import type { AgentDefinition } from "./types"

export interface ModelDrawerV2Props {
  /** 当前选中的 model key */
  selectedModel?: string | null
  /** 选中后回调 */
  onSelect?: (model: string) => void
  /** 触发器内容，默认显示"选择智能体" */
  children?: React.ReactNode
  /** 用户是否会员，决定 memberOnly 智能体是否可点 */
  isMember?: boolean
  className?: string
}

export function ModelDrawerV2({
  selectedModel,
  onSelect,
  children,
  isMember,
  className,
}: ModelDrawerV2Props) {
  const [open, setOpen] = React.useState(false)
  const current = selectedModel ? AGENT_REGISTRY[selectedModel] : null

  return (
    <SheetV2 open={open} onOpenChange={setOpen}>
      <SheetV2Trigger asChild>
        {children ?? (
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-pill)]",
              "border border-[var(--paper-300)] bg-white",
              "font-[var(--font-sans-v2)] text-[14px] font-medium text-[var(--ink-800)]",
              "hover:border-[var(--ink-300)] hover:bg-[var(--ink-50)]/40",
              "transition-colors duration-200",
              className
            )}
          >
            <span className="text-[var(--ink-500)]">智能体：</span>
            <span>{current?.name ?? "通用对话"}</span>
            <span className="text-[var(--ink-400)]">▾</span>
          </button>
        )}
      </SheetV2Trigger>

      <SheetV2Content side="right" className="w-[92vw] max-w-2xl">
        <SheetV2Header>
          <SheetV2Title>选择智能体</SheetV2Title>
          <SheetV2Description>
            按任务分组的全部 22 个智能体。每个智能体输出对应的学习产物模板。
          </SheetV2Description>
        </SheetV2Header>

        <div className="flex-1 overflow-auto px-6 py-4 font-[var(--font-sans-v2)]">
          {AGENT_GROUPS.map((group) => {
            const items = listAgentsByGroup(group.key)
            if (items.length === 0) return null
            return (
              <section key={group.key} className="mb-6">
                <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-500)]">
                  {group.label}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map((agent) => (
                    <AgentCard
                      key={agent.model}
                      agent={agent}
                      active={agent.model === selectedModel}
                      locked={agent.memberOnly && !isMember}
                      onClick={() => {
                        if (agent.memberOnly && !isMember) return
                        onSelect?.(agent.model)
                        setOpen(false)
                      }}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </SheetV2Content>
    </SheetV2>
  )
}

function AgentCard({
  agent,
  active,
  locked,
  onClick,
}: {
  agent: AgentDefinition
  active?: boolean
  locked?: boolean
  onClick?: () => void
}) {
  const Icon = agent.icon
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      className={cn(
        "group relative flex items-start gap-3 rounded-[var(--radius-soft)] p-3 text-left",
        "transition-colors duration-200",
        active
          ? "bg-[var(--ink-50)] border border-[var(--ink-300)]"
          : "border border-[var(--paper-200)] bg-white hover:bg-[var(--ink-50)]/60",
        locked && "opacity-50 cursor-not-allowed"
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-soft)]",
          active
            ? "bg-[var(--ink-700)] text-white"
            : "bg-[var(--ink-50)] text-[var(--ink-700)]"
        )}
      >
        {Icon ? <Icon className="size-4" /> : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-[var(--font-display)] text-[14px] font-bold text-[var(--ink-800)]">
            {agent.name}
          </span>
          {agent.memberOnly ? (
            <BadgeV2 variant="seal">
              <Lock className="size-2.5 mr-0.5" />
              会员
            </BadgeV2>
          ) : null}
        </div>
        <p className="mt-0.5 text-[12px] leading-[1.5] text-[var(--ink-500)] line-clamp-2">
          {agent.description}
        </p>
        {agent.priceLabel ? (
          <p className="mt-1 text-[11px] text-[var(--ink-400)] font-[var(--font-mono-v2)]">
            {agent.priceLabel}
          </p>
        ) : null}
      </div>

      {active ? (
        <span
          className="absolute right-3 top-3 size-1.5 rounded-full bg-[var(--seal-500)]"
          aria-hidden="true"
        />
      ) : null}
    </button>
  )
}
