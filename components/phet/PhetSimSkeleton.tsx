"use client"

import { FlaskConical } from "lucide-react"
import { cn } from "@/lib/utils"

export function PhetSimSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full min-h-[260px] flex-col items-center justify-center rounded-lg bg-emerald-50/70 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100", className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm dark:bg-emerald-950">
        <FlaskConical className="h-7 w-7 animate-pulse text-emerald-600" />
      </div>
      <div className="h-3 w-44 animate-pulse rounded-full bg-emerald-200/80 dark:bg-emerald-800" />
      <div className="mt-3 h-2 w-28 animate-pulse rounded-full bg-emerald-100 dark:bg-emerald-900" />
    </div>
  )
}
