"use client"

import type React from "react"
// v2: Sheet 画廊替代原 dropdown

import { useEffect, useMemo, useState } from "react"
import { ChevronDown, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  SheetV2,
  SheetV2Content,
  SheetV2Trigger,
  SheetV2Header,
  SheetV2Title,
  SheetV2Description,
  BadgeV2,
} from "@/components/ui/v2"
import { AGENT_REGISTRY, AGENT_GROUPS, listAgentsByGroup } from "@/components/chat/v2/agent-registry"
import type { ModelKey } from "@/components/ModelLogo"

export interface Model {
  key: string
  name: string
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }> | string
  color: string
  description?: string
  badge?: string
  group?: string
  modelKey?: ModelKey
}

interface ModelSelectorProps {
  selectedModel: string
  onModelChange: (model: string) => void
  models: Model[]
  disabled?: boolean
  className?: string
  dailyFreeInfo?: {
    used: number
    total: number
  }
  isMember?: boolean
}

export function ModelSelector({
  selectedModel,
  onModelChange,
  models,
  disabled,
  className,
  dailyFreeInfo,
  isMember = true,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false)

  const current = useMemo(() => {
    return AGENT_REGISTRY[selectedModel] ?? models.find((item) => item.key === selectedModel) ?? null
  }, [models, selectedModel])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open])

  return (
    <SheetV2 open={open} onOpenChange={setOpen}>
      <SheetV2Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-[var(--radius-pill)]",
            "border border-[var(--paper-300)] bg-[var(--paper-50)]",
            "text-[13px] font-medium text-[var(--ink-700)] font-[var(--font-sans-v2)]",
            "hover:bg-[var(--ink-50)] hover:border-[var(--ink-300)] transition-colors duration-200",
            "disabled:cursor-not-allowed disabled:opacity-60",
            className
          )}
        >
          <span className="text-[var(--ink-500)]">智能体：</span>
          <span className="truncate">{current?.name ?? "通用对话"}</span>
          <ChevronDown className="size-3.5 text-[var(--ink-400)]" />
        </button>
      </SheetV2Trigger>

      <SheetV2Content side="right" className="w-[92vw] max-w-2xl">
        <SheetV2Header>
          <SheetV2Title>选择智能体</SheetV2Title>
          <SheetV2Description>
            按任务分组 · 全部 22 个
          </SheetV2Description>
          {dailyFreeInfo ? (
            <div className="text-[11px] text-[var(--ink-400)] font-[var(--font-mono-v2)]">
              今日免费额度：{dailyFreeInfo.used}/{dailyFreeInfo.total}
            </div>
          ) : null}
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
                  {items.map((agent) => {
                    const locked = Boolean(agent.memberOnly && !isMember)
                    const active = agent.model === selectedModel
                    const Icon = agent.icon

                    return (
                      <button
                        key={agent.model}
                        type="button"
                        onClick={() => {
                          if (locked) return
                          onModelChange(agent.model)
                          setOpen(false)
                        }}
                        disabled={locked}
                        className={cn(
                          "group relative flex items-start gap-3 rounded-[var(--radius-soft)] p-3 text-left border transition-colors duration-200",
                          active
                            ? "bg-[var(--ink-50)] border-[var(--ink-300)]"
                            : "border-[var(--paper-200)] bg-white hover:bg-[var(--ink-50)]/60",
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
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </SheetV2Content>
    </SheetV2>
  )
}

export default ModelSelector

/*
Legacy dropdown implementation preserved in git history for rollback.
Use `git show HEAD^:components/chat/ModelSelector.tsx` if you need the exact pre-v2 version.
*/
