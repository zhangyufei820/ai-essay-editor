"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Search, Sparkles, X } from "lucide-react"
import { ButtonV2 as Button, InputV2 as Input } from "@/components/ui/v2"
import { cn } from "@/lib/utils"
import {
  CODEX_SKILL_CATEGORIES,
  CODEX_SKILLS,
  type CodexSkill,
  type CodexSkillCategory,
} from "@/lib/codex-skills"

type CodexSkillPickerProps = {
  open: boolean
  selectedSkillId?: string | null
  onSelect: (skill: CodexSkill) => void
  onClose: () => void
}

function categoryLabel(category: CodexSkillCategory, count: number) {
  return `${category} · ${count} 个技能`
}

export function CodexSkillPicker({
  open,
  selectedSkillId,
  onSelect,
  onClose,
}: CodexSkillPickerProps) {
  const [query, setQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState<CodexSkillCategory | "全部">("全部")
  const [isMelting, setIsMelting] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) {
      setQuery("")
      setActiveCategory("全部")
      setIsMelting(false)
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  const categoryCounts = useMemo(() => {
    return CODEX_SKILLS.reduce<Record<CodexSkillCategory, number>>((acc, skill) => {
      acc[skill.category] = (acc[skill.category] ?? 0) + 1
      return acc
    }, {} as Record<CodexSkillCategory, number>)
  }, [])

  const filteredSkills = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return CODEX_SKILLS.filter((skill) => {
      if (activeCategory !== "全部" && skill.category !== activeCategory) return false
      if (!normalizedQuery) return true

      return [
        skill.id,
        skill.name,
        skill.category,
        skill.description,
        ...skill.tags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [activeCategory, query])

  const groupedSkills = useMemo(() => {
    return CODEX_SKILL_CATEGORIES.map((category) => ({
      category,
      skills: filteredSkills.filter((skill) => skill.category === category),
    })).filter((group) => group.skills.length > 0)
  }, [filteredSkills])

  const handleSelect = (skill: CodexSkill) => {
    setIsMelting(true)
    onSelect(skill)
    window.setTimeout(onClose, 420)
  }

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-[rgba(14,27,17,0.32)] p-3 text-[var(--ink-800)] backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="加载 Codex 技能"
          initial={{ opacity: 0 }}
          animate={{
            opacity: isMelting ? 0 : 1,
            filter: isMelting ? "blur(10px)" : "blur(0px)",
            scale: isMelting ? 0.985 : 1,
            borderRadius: isMelting ? "28px" : "0px",
            y: isMelting ? 28 : 0,
          }}
          exit={{
            opacity: 0,
            filter: "blur(12px)",
            scale: 0.98,
            y: 36,
            borderRadius: "32px",
          }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex h-[calc(100vh-24px)] w-full max-w-[1180px] flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--paper-200)] bg-[var(--paper-50)] shadow-[0_28px_80px_rgba(14,27,17,0.24)] sm:h-[calc(100vh-48px)]">
            <header className="shrink-0 border-b border-[var(--paper-200)] bg-[var(--paper-50)]/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
              <div className="mx-auto flex max-w-6xl items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--ink-200)] bg-[var(--ink-50)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-600)]">
                    <Sparkles className="size-3.5" />
                    Codex Skills
                  </div>
                  <h2 className="mt-2 font-[var(--font-display)] text-[22px] font-bold tracking-normal text-[var(--ink-900)] sm:text-[28px]">
                    加载技能
                  </h2>
                  <p className="mt-1 max-w-2xl text-[13px] leading-6 text-[var(--ink-500)] sm:text-sm">
                    选择一个技能后，会把对应英文技能标识传递给超级全能智能体，让当前对话按该技能执行。
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-1 rounded-full"
                  onClick={onClose}
                  aria-label="关闭技能选择"
                >
                  <X className="size-5" />
                </Button>
              </div>
            </header>

            <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <div className="mx-auto max-w-6xl">
                <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-[var(--paper-100)] bg-[var(--paper-50)]/95 px-4 pb-4 backdrop-blur sm:-mx-6 sm:px-6">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <label className="relative block">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-400)]" />
                      <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="搜索技能名称、用途、标签或英文 id"
                        className="h-11 rounded-[var(--radius-pill)] bg-white pl-9"
                      />
                    </label>
                    <div className="flex gap-2 overflow-x-auto pb-1 lg:max-w-[560px]">
                      {(["全部", ...CODEX_SKILL_CATEGORIES] as const).map((category) => {
                        const isActive = activeCategory === category
                        const label =
                          category === "全部"
                            ? `全部 · ${CODEX_SKILLS.length}`
                            : categoryLabel(category, categoryCounts[category] ?? 0)
                        return (
                          <button
                            key={category}
                            type="button"
                            onClick={() => setActiveCategory(category)}
                            className={cn(
                              "shrink-0 rounded-[var(--radius-pill)] border px-3 py-2 text-[12px] font-semibold transition-colors",
                              isActive
                                ? "border-[var(--ink-500)] bg-[var(--ink-700)] text-white"
                                : "border-[var(--paper-200)] bg-white text-[var(--ink-600)] hover:border-[var(--ink-300)] hover:bg-[var(--ink-50)]"
                            )}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {filteredSkills.length === 0 ? (
                  <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--paper-300)] bg-white px-5 py-10 text-center">
                    <p className="text-sm font-semibold text-[var(--ink-700)]">没有找到匹配技能</p>
                    <p className="mt-1 text-xs text-[var(--ink-500)]">换一个关键词，或切回全部分类查看。</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groupedSkills.map((group) => (
                      <section key={group.category} aria-labelledby={`codex-skill-${group.category}`}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h3
                            id={`codex-skill-${group.category}`}
                            className="font-[var(--font-display)] text-base font-bold text-[var(--ink-900)]"
                          >
                            {categoryLabel(group.category, group.skills.length)}
                          </h3>
                          <div className="h-px flex-1 bg-[var(--paper-200)]" />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {group.skills.map((skill) => {
                            const selected = selectedSkillId === skill.id
                            return (
                              <motion.button
                                key={skill.id}
                                type="button"
                                onClick={() => handleSelect(skill)}
                                className={cn(
                                  "group flex min-h-[164px] flex-col rounded-[var(--radius-card)] border bg-white p-4 text-left shadow-sm transition-[border-color,box-shadow,transform,background-color]",
                                  "hover:-translate-y-0.5 hover:border-[var(--ink-300)] hover:bg-[var(--ink-50)] hover:shadow-[0_12px_28px_rgba(14,27,17,0.10)]",
                                  "focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus-ink)]",
                                  selected
                                    ? "border-[var(--ink-500)] bg-[var(--ink-50)]"
                                    : "border-[var(--paper-200)]"
                                )}
                                whileTap={{ y: 1 }}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="font-[var(--font-display)] text-[15px] font-bold leading-6 text-[var(--ink-900)]">
                                      {skill.name}
                                    </p>
                                    <p className="mt-1 truncate font-[var(--font-mono-v2)] text-[11px] text-[var(--ink-400)]">
                                      {skill.id}
                                    </p>
                                  </div>
                                  <span
                                    className={cn(
                                      "inline-flex size-8 shrink-0 items-center justify-center rounded-full border",
                                      selected
                                        ? "border-[var(--ink-600)] bg-[var(--ink-700)] text-white"
                                        : "border-[var(--paper-200)] bg-[var(--paper-50)] text-[var(--ink-500)] group-hover:border-[var(--ink-300)]"
                                    )}
                                  >
                                    {selected ? <Check className="size-4" /> : <Sparkles className="size-4" />}
                                  </span>
                                </div>
                                <p className="mt-3 line-clamp-3 flex-1 text-[13px] leading-6 text-[var(--ink-600)]">
                                  {skill.description}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {skill.tags.slice(0, 3).map((tag) => (
                                    <span
                                      key={tag}
                                      className="rounded-[var(--radius-pill)] border border-[var(--paper-200)] bg-[var(--paper-50)] px-2 py-1 text-[11px] text-[var(--ink-500)]"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </motion.button>
                            )
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </main>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
