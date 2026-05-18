"use client"

import { cn } from "@/lib/utils"
import { IconLab } from "@/components/icons/v2"

export function PhetSimSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full min-h-[260px] flex-col items-center justify-center rounded-[var(--radius-soft)] bg-[var(--ink-50)]/70 text-[var(--ink-900)] dark:bg-[var(--ink-900)]/30 dark:text-[var(--ink-100)]", className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--paper-50)] shadow-sm dark:bg-[var(--ink-900)]">
        <IconLab className="h-7 w-7 animate-pulse text-[var(--ink-600)]" />
      </div>
      <div className="h-3 w-44 animate-pulse rounded-full bg-[var(--ink-200)]/80 dark:bg-[var(--ink-800)]" />
      <div className="mt-3 h-2 w-28 animate-pulse rounded-full bg-[var(--ink-100)] dark:bg-[var(--ink-900)]" />
    </div>
  )
}
