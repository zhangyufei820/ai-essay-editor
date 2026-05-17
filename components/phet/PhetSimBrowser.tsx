"use client"

import { ButtonV2 as Button, InputV2 as Input } from "@/components/ui/v2"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import {
  filterPhetSims,
  getRecommendedPhetSims,
  sortPhetSims,
  type PhetSortMode,
} from "@/lib/phet/phet-utils"
import type { PhetSim, PhetSubject } from "@/lib/phet/sims-catalog"
import { PhetSimCard } from "@/components/phet/PhetSimCard"

interface PhetSimBrowserProps {
  subject?: "math" | "physics" | "all"
  gradeFilter?: number
  onSelectSim?: (sim: PhetSim) => void
  completedSimIds?: string[]
  recentSimIds?: string[]
}

export function PhetSimBrowser({
  subject = "all",
  gradeFilter,
  onSelectSim,
  completedSimIds = [],
  recentSimIds = [],
}: PhetSimBrowserProps) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [selectedSubject, setSelectedSubject] = useState<PhetSubject | "all">(subject)
  const [grade, setGrade] = useState<number | null>(gradeFilter || null)
  const [difficulty, setDifficulty] = useState<PhetSim["difficulty"] | "all">("all")
  const [sortMode, setSortMode] = useState<PhetSortMode>("recommended")
  const completedSet = useMemo(() => new Set(completedSimIds), [completedSimIds])

  const sims = useMemo(() => {
    const filtered = filterPhetSims({ query, subject: selectedSubject, grade, difficulty })
    return sortPhetSims(filtered, sortMode, recentSimIds)
  }, [difficulty, grade, query, recentSimIds, selectedSubject, sortMode])

  const recommended = useMemo(
    () => getRecommendedPhetSims({ grade, subject: selectedSubject, limit: 4 }),
    [grade, selectedSubject],
  )

  const selectSim = (sim: PhetSim) => {
    if (onSelectSim) onSelectSim(sim)
    else router.push(`/lab/${sim.id}`)
  }

  return (
    <div className="space-y-7">
      <section className="rounded-[var(--radius-soft)] border border-[var(--ink-900)]/10 bg-[var(--paper-50)] p-4 shadow-sm dark:border-[var(--ink-200)]/10 dark:bg-slate-950">
        <div className="grid gap-3 lg:grid-cols-[1fr_160px_160px_160px_160px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-400)]" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索实验、知识点、年级内容"
              className="pl-9"
            />
          </label>
          <select value={selectedSubject} onChange={(event) => setSelectedSubject(event.target.value as PhetSubject | "all")} className="h-10 rounded-[var(--radius-soft)] border border-input bg-[var(--paper-50)] px-3 text-sm">
            <option value="all">全部学科</option>
            <option value="math">数学</option>
            <option value="physics">物理</option>
          </select>
          <select value={grade || "all"} onChange={(event) => setGrade(event.target.value === "all" ? null : Number(event.target.value))} className="h-10 rounded-[var(--radius-soft)] border border-input bg-[var(--paper-50)] px-3 text-sm">
            <option value="all">全部年级</option>
            {Array.from({ length: 12 }).map((_, index) => (
              <option key={index + 1} value={index + 1}>{index + 1} 年级</option>
            ))}
          </select>
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value === "all" ? "all" : Number(event.target.value) as PhetSim["difficulty"])} className="h-10 rounded-[var(--radius-soft)] border border-input bg-[var(--paper-50)] px-3 text-sm">
            <option value="all">全部难度</option>
            <option value={1}>基础</option>
            <option value={2}>进阶</option>
            <option value={3}>挑战</option>
          </select>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as PhetSortMode)} className="h-10 rounded-[var(--radius-soft)] border border-input bg-[var(--paper-50)] px-3 text-sm">
            <option value="recommended">推荐</option>
            <option value="popular">最热</option>
            <option value="recent">最新使用</option>
          </select>
        </div>
      </section>

      {recommended.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[var(--ink-900)] dark:text-[var(--ink-50)]">推荐实验</h2>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSortMode("recommended")}>查看推荐排序</Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {recommended.map((sim) => (
              <PhetSimCard key={sim.id} sim={sim} onClick={selectSim} showBadge badgeLabel={completedSet.has(sim.id) ? "已学习" : "推荐"} />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink-900)] dark:text-[var(--ink-50)]">全部实验</h2>
            <p className="mt-1 text-sm text-[var(--ink-500)]">共 {sims.length} 个匹配结果</p>
          </div>
        </div>
        {sims.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {sims.map((sim) => (
              <PhetSimCard key={sim.id} sim={sim} onClick={selectSim} showBadge={completedSet.has(sim.id)} badgeLabel="已学习" />
            ))}
          </div>
        ) : (
          <div className="rounded-[var(--radius-soft)] border border-dashed border-[var(--ink-900)]/20 bg-[var(--paper-50)] p-10 text-center text-[var(--ink-500)] dark:border-[var(--ink-200)]/10 dark:bg-slate-950">
            没有找到匹配的实验，换个关键词或筛选条件试试。
          </div>
        )}
      </section>
    </div>
  )
}
