/**
 * 💳 Loading State Card
 *
 * Simple minimal loading indicator without cycling symbols or text.
 */

"use client"

import React from "react"
import { Loader2 } from "lucide-react"

// ============================================
// LoadingStateCard Props
// ============================================

interface LoadingStateCardProps {
  modelKey?: string
  className?: string
}

// ============================================
// LoadingStateCard Component
// ============================================

/**
 * Simple loading indicator with just a spinner icon.
 * No cycling symbols, no text, minimal design.
 */
export function LoadingStateCard({
  modelKey = "standard",
  className
}: LoadingStateCardProps) {
  return (
    <div
      className={`
        rounded-2xl
        px-4 py-3
        flex items-center justify-center
        ${className || ""}
      `}
    >
      <Loader2
        className="w-5 h-5 animate-spin text-[#10A37F]"
        strokeWidth={2}
      />
    </div>
  )
}

// ============================================
// Compact Loading State (inline)
// ============================================

export function CompactLoadingState({
  modelKey = "standard",
  className
}: LoadingStateCardProps) {
  return (
    <div
      className={`inline-flex items-center gap-2 ${className || ""}`}
    >
      <Loader2
        className="w-4 h-4 animate-spin text-[#10A37F]"
        strokeWidth={2}
      />
    </div>
  )
}
