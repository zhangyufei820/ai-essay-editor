"use client"

import { BadgeV2 as Badge } from "@/components/ui/v2"
import Image from "next/image"
import { Clock, GraduationCap, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { getDifficultyLabel, getSubjectLabel } from "@/lib/phet/phet-utils"
import type { PhetSim } from "@/lib/phet/sims-catalog"

interface PhetSimCardProps {
  sim: PhetSim
  onClick: (sim: PhetSim) => void
  showBadge?: boolean
  badgeLabel?: string
}

export function PhetSimCard({ sim, onClick, showBadge = false, badgeLabel }: PhetSimCardProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(sim)}
      className="group flex h-full min-h-[360px] flex-col overflow-hidden rounded-[var(--radius-soft)] border border-emerald-900/10 bg-[var(--paper-50)] text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-[var(--ink-200)]/10 dark:bg-slate-950"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[var(--ink-50)] dark:bg-emerald-950/30">
        <Image
          src={sim.thumbnail}
          alt={`${sim.name_zh} 缩略图`}
          fill
          sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        {showBadge ? (
          <Badge className="absolute right-3 top-3 bg-[var(--ink-600)] text-white">
            {badgeLabel || "推荐"}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="paper">{getSubjectLabel(sim.subject)}</Badge>
          <Badge variant="ghost">{getDifficultyLabel(sim.difficulty)}</Badge>
        </div>
        <h3 className="text-base font-semibold text-[var(--ink-900)] dark:text-white">{sim.name_zh}</h3>
        <p className="mt-1 text-xs text-[var(--ink-500)]">{sim.name_en}</p>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--ink-600)] dark:text-slate-300">{sim.description_zh}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sim.topics.slice(0, 4).map((topic) => (
            <span key={topic} className="rounded-md bg-[var(--ink-50)] px-2 py-1 text-xs text-[var(--ink-800)] dark:bg-emerald-950 dark:text-emerald-200">
              {topic}
            </span>
          ))}
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4 text-xs text-[var(--ink-500)]">
          <span className="inline-flex items-center gap-1">
            <GraduationCap className="h-3.5 w-3.5" />
            {sim.grade_range[0]}-{sim.grade_range[1]} 年级
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {sim.duration_minutes} 分钟
          </span>
          <span className="inline-flex items-center gap-0.5 text-amber-500">
            {Array.from({ length: 3 }).map((_, index) => (
              <Star key={index} className={cn("h-3.5 w-3.5", index < sim.difficulty ? "fill-current" : "opacity-25")} />
            ))}
          </span>
        </div>
      </div>
    </button>
  )
}
