/**
 * 🎨 Artistic Thinking Icons
 * 
 * Lucide linear icons for each AI model with looping zoom animation.
 * Used by LoadingStateCard during AI processing states.
 */

"use client"

import React from "react"
import { FileCheck2, Languages, LayoutDashboard, UsersRound, BrainCircuit } from "lucide-react"
import { IconAllInOne, IconDiagnosis, IconMath } from "@/components/icons/v2"

// ============================================
// Model to Icon Mapping
// ============================================

export type ModelIconKey = 
  | "standard"        // 作文批改
  | "teaching-pro"    // 教学评助手
  | "quanquan-math"   // 全学段数学
  | "quanquan-english" // 全学段英语
  | "vocab-card"      // 词境记忆卡
  | "beike-pro"       // 备课助手
  | "banzhuren"       // 班主任助手
  | "all-in-one-agent" // 全能超级智能体
  | "worksheet-diagnosis" // 错题诊断海报

const MODEL_ICONS: Record<ModelIconKey, React.ElementType> = {
  "standard": FileCheck2,
  "teaching-pro": IconAllInOne,
  "quanquan-math": IconMath,
  "quanquan-english": Languages,
  "vocab-card": Languages,
  "beike-pro": LayoutDashboard,
  "banzhuren": UsersRound,
  "all-in-one-agent": BrainCircuit,
  "worksheet-diagnosis": IconDiagnosis,
}

// ============================================
// Icon Props
// ============================================

interface ArtisticIconProps {
  modelKey: ModelIconKey
  size?: number
  className?: string
  style?: React.CSSProperties
}

// ============================================
// ArtisticThinkingIcon Component
// ============================================

/**
 * Single icon with zoom animation (scale 0.8 → 1.1, 2.5s cycle)
 */
export function ArtisticThinkingIcon({
  modelKey,
  size = 24,
  className,
  style
}: ArtisticIconProps) {
  const IconComponent = MODEL_ICONS[modelKey]

  if (!IconComponent) return null

  return (
    <div
      className={`animate-artistic-zoom inline-flex items-center justify-center ${className || ""}`}
      style={style}
    >
      <IconComponent
        size={size}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </div>
  )
}

// ============================================
// ArtisticThinkingIconGroup Component
// ============================================

/**
 * Grid of icons that animate together - useful for loading states
 */
export function ArtisticThinkingIconGroup({ 
  modelKeys,
  size = 20,
  className 
}: {
  modelKeys: ModelIconKey[]
  size?: number
  className?: string
}) {
  return (
    <div
      className={`flex items-center justify-center gap-3 ${className || ""}`}
    >
      {modelKeys.map((key, index) => (
        <ArtisticThinkingIcon 
          key={key}
          modelKey={key}
          size={size}
          style={{
            animationDelay: `${index * 0.15}s`,
          }}
        />
      ))}
    </div>
  )
}

// ============================================
// Default Export
// ============================================

export { MODEL_ICONS }
