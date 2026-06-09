"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, ChevronDown, ExternalLink, Lock, Search, X } from "lucide-react"
import { MarketingShell } from "@/components/v2-chrome"
import { ModelLogo } from "@/components/ModelLogo"
import { BadgeV2, ButtonV2, CardV2, CardV2Content, InputV2 } from "@/components/ui/v2"
import { cn } from "@/lib/utils"
import { IconAllInOne, IconExplore } from "@/components/icons/v2"
import {
  AGENT_CATEGORIES,
  CORE_AGENT_IDS,
  PLAZA_AGENTS,
  getAgentCategoryKey,
  getCoreAgents,
  type AgentCategory,
  type AgentCategoryKey,
  type PlazaAgent,
} from "./agent-plaza-data"

const COLLAPSE_THRESHOLD = 6

const CATEGORY_DESCRIPTIONS: Partial<Record<AgentCategory, string>> = {
  推荐: "优先展示站内核心能力和高频入口。",
  通用助手: "适合不确定从哪里开始、需要综合处理或教师自定义的场景。",
  公众号与内容写作: "覆盖公众号长文、素材成稿、内容扩写和可发布文章续写。",
  中文润色与纠错: "把文本改得更顺、更自然，并处理语法、标点和校对问题。",
  论文与学术: "围绕论文选题、大纲、评审、投稿前终检和实验报告展开。",
  中小学作文: "面向作文批改、议论文、初中作文和散文升格。",
  小学作文专项: "针对小学不同年级和文体的细分作文能力。",
  高中写作: "面向高中论述文、议论文生成和升格。",
  英语写作与语法: "覆盖中英作文、英语语法讲解、词汇记忆和高中英语作文。",
  教学与学科: "服务教师备课、班主任管理、学科答疑、错题诊断和互动实验。",
  图像与创作: "图像生成、图像编辑、提示词反推、音乐和 3D 创作入口。",
  独立模型: "直接进入 ChatGPT、Claude、Gemini、Grok 等模型原生对话。",
  其他工具: "OCR、文档提取、演示文稿、网页搜索、综合报告和 TTS 等工具。",
}

const MAIN_TOOL_IDS = [
  "standard",
  "ai-writing-paper",
  "zhongying-essay",
  "experiment-report",
  "teaching-pro",
  "beike-pro",
  "banzhuren",
  "quanquan-math",
  "quanquan-english",
  "vocab-card",
  "problem",
  "worksheet-diagnosis",
  "gpt-image-2",
] as const

const categoryOptions = [{ key: "all", label: "全部" }, ...AGENT_CATEGORIES] as const

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function agentSearchText(agent: PlazaAgent) {
  return normalize(
    [
      agent.id,
      agent.name,
      agent.category,
      agent.description,
      agent.skill,
      agent.agent,
      agent.routeId,
      agent.workflowSkill ? "workflow-skill" : "",
      ...agent.tags,
    ]
      .filter(Boolean)
      .join(" "),
  )
}

function isCoreAgent(agent: PlazaAgent) {
  return (CORE_AGENT_IDS as readonly string[]).includes(agent.id)
}

export function AgentPlazaPage() {
  const [activeCategory, setActiveCategory] = React.useState<AgentCategoryKey | "all">("all")
  const [query, setQuery] = React.useState("")
  const [expandedSections, setExpandedSections] = React.useState<Set<AgentCategoryKey>>(() => new Set())

  const coreAgents = React.useMemo(() => getCoreAgents(), [])
  const mainToolAgents = React.useMemo(
    () => MAIN_TOOL_IDS.map((id) => PLAZA_AGENTS.find((agent) => agent.id === id)).filter(Boolean) as PlazaAgent[],
    [],
  )

  const filteredAgents = React.useMemo(() => {
    const keyword = normalize(query)
    return PLAZA_AGENTS.filter((agent) => {
      if (activeCategory !== "all" && getAgentCategoryKey(agent.category) !== activeCategory) return false
      if (!keyword) return true
      return agentSearchText(agent).includes(keyword)
    })
  }, [activeCategory, query])

  const visibleCoreAgents = React.useMemo(() => {
    const keyword = normalize(query)
    if (activeCategory !== "all" && activeCategory !== "recommended") return []
    return coreAgents.filter((agent) => !keyword || agentSearchText(agent).includes(keyword))
  }, [activeCategory, coreAgents, query])

  const categorySectionAgents = React.useMemo(
    () => filteredAgents.filter((agent) => !isCoreAgent(agent)),
    [filteredAgents],
  )

  const agentsByCategory = React.useMemo(() => {
    const grouped = new Map<AgentCategory, PlazaAgent[]>()
    for (const category of AGENT_CATEGORIES) grouped.set(category.label, [])
    for (const agent of categorySectionAgents) {
      if (!grouped.has(agent.category)) grouped.set(agent.category, [])
      grouped.get(agent.category)?.push(agent)
    }
    return grouped
  }, [categorySectionAgents])

  const visibleAgentCount = PLAZA_AGENTS.length
  const workflowCount = PLAZA_AGENTS.filter((agent) => agent.workflowSkill).length

  const toggleSection = (key: AgentCategoryKey) => {
    setExpandedSections((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <MarketingShell>
      <section className="relative overflow-hidden border-b border-[var(--paper-200)] bg-[linear-gradient(180deg,var(--paper-50)_0%,var(--ink-50)_100%)]">
        <div className="absolute inset-x-0 bottom-0 h-px bg-[var(--ink-200)]/50" aria-hidden="true" />
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 md:px-6 md:py-16 lg:grid-cols-[1.08fr_0.92fr] lg:items-end">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--ink-200)] bg-[var(--paper-50)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-700)] shadow-[var(--shadow-paper)] font-[var(--font-sans-v2)]">
              <IconAllInOne className="size-3.5" aria-hidden="true" />
              沈翔智学智能体广场
            </span>
            <h1 className="mt-5 max-w-3xl font-[var(--font-display)] text-[clamp(34px,5vw,58px)] font-black leading-[1.06] text-[var(--ink-900)]">
              按任务选择智能体，
              <br />
              让学习和创作直接进入状态。
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-[1.85] text-[var(--ink-600)] font-[var(--font-sans-v2)] sm:text-[17px]">
              写作、论文、学科讲解、教学准备、图像音乐创作和专业能力都在同一个入口。每个任务能力都整理成智能体卡片，直接进入对应任务。
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
              <IconExplore className="size-5 text-[var(--ink-500)]" aria-hidden="true" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-[12px] text-[var(--ink-600)] font-[var(--font-sans-v2)] sm:grid-cols-3">
              {[
                [String(workflowCount), "任务能力"],
                [String(mainToolAgents.length), "主力工具"],
                [String(AGENT_CATEGORIES.length), "分类"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-100)] px-3 py-2"
                >
                  <span className="block font-[var(--font-display)] text-[18px] font-black text-[var(--ink-800)]">
                    {value}
                  </span>
                  <span className="mt-0.5 block text-[11px] font-semibold text-[var(--ink-500)]">
                    {label}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] leading-5 text-[var(--ink-500)] font-[var(--font-sans-v2)]">
              已接入 {workflowCount} 个写作 / 学习 / 论文 / 作文 / 英语类任务能力。
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[var(--paper-50)]">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6 md:py-14">
          {visibleCoreAgents.length > 0 ? (
            <section className="mb-12">
              <SectionHeading label="Core" title="核心推荐" count={visibleCoreAgents.length} />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {visibleCoreAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} featured />
                ))}
              </div>
            </section>
          ) : null}

          <div className="sticky top-0 z-20 mb-8 border-y border-[var(--paper-200)] bg-[var(--paper-50)]/95 py-4 backdrop-blur">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
              <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {categoryOptions.map((category) => {
                  const key = category.key
                  const count =
                    key === "all"
                      ? PLAZA_AGENTS.length
                      : PLAZA_AGENTS.filter((agent) => getAgentCategoryKey(agent.category) === key).length
                  if (key !== "all" && count === 0) return null
                  const active = activeCategory === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveCategory(key)}
                      className={cn(
                        "shrink-0 rounded-[var(--radius-pill)] border px-3 py-2 text-[13px] font-semibold transition-colors font-[var(--font-sans-v2)]",
                        active
                          ? "border-[var(--ink-600)] bg-[var(--ink-600)] text-white"
                          : "border-[var(--paper-200)] bg-[var(--paper-100)] text-[var(--ink-600)] hover:border-[var(--ink-300)] hover:bg-[var(--ink-50)]",
                      )}
                    >
                      {category.label}
                      <span className={cn("ml-1 font-[var(--font-mono-v2)] text-[11px]", active ? "text-white/75" : "text-[var(--ink-400)]")}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-400)]" aria-hidden="true" />
                <InputV2
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索名称、简介、标签或 skill"
                  className="pl-9 pr-9"
                  aria-label="搜索智能体"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-[var(--radius-pill)] text-[var(--ink-400)] hover:bg-[var(--ink-50)] hover:text-[var(--ink-700)]"
                    aria-label="清空搜索"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {filteredAgents.length === 0 ? (
            <CardV2 variant="inset" className="items-center justify-center p-8 text-center">
              <p className="font-[var(--font-display)] text-[18px] font-bold text-[var(--ink-800)]">
                没有找到匹配的智能体
              </p>
              <p className="mt-2 text-[13px] leading-6 text-[var(--ink-500)] font-[var(--font-sans-v2)]">
                换一个关键词，或清空筛选后查看全部入口。
              </p>
            </CardV2>
          ) : categorySectionAgents.length === 0 ? (
            <CardV2 variant="inset" className="items-center justify-center p-8 text-center">
              <p className="font-[var(--font-display)] text-[18px] font-bold text-[var(--ink-800)]">
                核心推荐已在顶部展示
              </p>
              <p className="mt-2 text-[13px] leading-6 text-[var(--ink-500)] font-[var(--font-sans-v2)]">
                可切换到其他分类查看全部写作、学习、论文、图像和工具智能体。
              </p>
            </CardV2>
          ) : (
            AGENT_CATEGORIES.map((category) => {
              const agents = agentsByCategory.get(category.label) || []
              if (agents.length === 0) return null
              const expanded = expandedSections.has(category.key)
              const canCollapse = agents.length > COLLAPSE_THRESHOLD
              const visibleAgents = canCollapse && !expanded ? agents.slice(0, COLLAPSE_THRESHOLD) : agents

              return (
                <section
                  id={`agent-category-${category.key}`}
                  key={category.key}
                  className="mb-12 scroll-mt-28 last:mb-0"
                >
                  <SectionHeading
                    label={category.label}
                    title={`${category.label}智能体`}
                    count={agents.length}
                    description={CATEGORY_DESCRIPTIONS[category.label]}
                  />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {visibleAgents.map((agent) => (
                      <AgentCard key={agent.id} agent={agent} featured={agent.featured || isCoreAgent(agent)} />
                    ))}
                  </div>
                  {canCollapse ? (
                    <div className="mt-4 flex justify-center">
                      <ButtonV2
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleSection(category.key)}
                        className="min-w-36"
                        aria-expanded={expanded}
                        aria-controls={`agent-category-${category.key}`}
                      >
                        {expanded ? "收起" : `展开更多 ${agents.length - COLLAPSE_THRESHOLD} 个`}
                        <ChevronDown
                          className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
                          aria-hidden="true"
                        />
                      </ButtonV2>
                    </div>
                  ) : null}
                </section>
              )
            })
          )}
        </div>
      </section>
    </MarketingShell>
  )
}

function SectionHeading({
  label,
  title,
  count,
  description,
}: {
  label: string
  title: string
  count: number
  description?: string
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 border-b border-[var(--paper-200)] pb-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-500)] font-[var(--font-sans-v2)]">
          {label}
        </p>
        <h2 className="mt-1 font-[var(--font-display)] text-[24px] font-bold text-[var(--ink-800)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--ink-500)] font-[var(--font-sans-v2)]">
            {description}
          </p>
        ) : null}
      </div>
      <span className="shrink-0 text-[12px] text-[var(--ink-400)] font-[var(--font-mono-v2)]">
        {count} 个
      </span>
    </div>
  )
}

function AgentCard({ agent, featured = false, compact = false }: { agent: PlazaAgent; featured?: boolean; compact?: boolean }) {
  const Icon = agent.icon

  return (
    <Link
      href={agent.href}
      prefetch={false}
      target={agent.external ? "_blank" : undefined}
      rel={agent.external ? "noreferrer" : undefined}
      className="group block h-full rounded-[var(--radius-sharp)] outline-none focus-visible:[box-shadow:var(--shadow-focus-ink)]"
    >
      <CardV2
        variant="paper"
        interactive
        className={cn(
          "h-full overflow-hidden",
          featured ? "border-[var(--ink-300)] bg-[linear-gradient(180deg,var(--ink-50),var(--paper-50))]" : "",
        )}
      >
        <CardV2Content className={cn("flex h-full flex-col gap-4", compact && "gap-3")}>
          <div className="flex items-start justify-between gap-3">
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-soft)]",
                "border border-[var(--paper-200)] bg-[var(--paper-100)] text-[var(--ink-700)] transition-colors duration-200",
                "group-hover:border-[var(--ink-300)] group-hover:bg-[var(--ink-50)]",
              )}
            >
              {agent.modelKey ? (
                <ModelLogo modelKey={agent.modelKey} size="md" />
              ) : (
                <Icon className="size-5" aria-hidden="true" />
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              {agent.memberOnly ? (
                <BadgeV2 variant="seal">
                  <Lock className="mr-0.5 size-2.5" aria-hidden="true" />
                  会员
                </BadgeV2>
              ) : null}
              {agent.badge ? <BadgeV2 variant="seal">{agent.badge}</BadgeV2> : null}
              {agent.priceLabel ? <BadgeV2 variant="paper">{agent.priceLabel}</BadgeV2> : null}
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-[var(--font-display)] text-[18px] font-bold text-[var(--ink-800)]">
                {agent.name}
              </h3>
              <BadgeV2 variant="ghost" className="text-[11px]">
                {agent.category}
              </BadgeV2>
            </div>
            <p className={cn("mt-2 text-[13px] leading-[1.7] text-[var(--ink-500)] font-[var(--font-sans-v2)]", compact ? "min-h-[42px]" : "min-h-[66px]")}>
              {agent.description}
            </p>
          </div>

          <div className="mt-auto space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {agent.tags.slice(0, compact ? 2 : 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-[var(--radius-pill)] bg-[var(--paper-100)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-500)] font-[var(--font-sans-v2)]"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-[11px] text-[var(--ink-400)] font-[var(--font-mono-v2)]">
                {agent.skill || agent.agent || agent.id}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-[var(--ink-700)] font-[var(--font-sans-v2)]">
                进入
                {agent.external ? (
                  <ExternalLink className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
                ) : (
                  <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
                )}
              </span>
            </div>
          </div>
        </CardV2Content>
      </CardV2>
    </Link>
  )
}
