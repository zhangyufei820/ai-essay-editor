/**
 * 💳 Loading State Card - Claude 极简风格
 *
 * 无动画圆圈，只有静态星形图标 + 浅灰色思考文字
 */

"use client"

import React from "react"
import { Sparkles } from "lucide-react"

// ============================================
// LoadingStateCard Props
// ============================================

interface LoadingStateCardProps {
  modelKey?: string
  className?: string
  showHint?: boolean   // true = 显示"深度思考中"提示
}

// ============================================
// LoadingStateCard Component - 极简思考指示器
// ============================================

/**
 * 极简思考指示器：
 * - 静态小星形图标（不旋转）
 * - 浅灰色 "Thinking..." 文字
 * - 左侧对齐，图标与文字顶部对齐
 */
export function LoadingStateCard({
  modelKey = "standard",
  className,
  showHint = false
}: LoadingStateCardProps) {
  return (
    <div className={`inline-flex flex-col gap-1 ${className || ""}`}>
      <div className="inline-flex items-center gap-1.5">
        <Sparkles
          className="w-3 h-3 text-slate-400 shrink-0"
          strokeWidth={1.5}
        />
        <span className="text-xs text-slate-400 font-normal tracking-wide">
          {showHint ? "AI 正在深度思考中..." : "Thinking..."}
        </span>
      </div>
      {showHint && (
        <span className="text-xs text-slate-400 font-normal tracking-wide ml-5">
          这可能需要一点时间，请耐心等待...
        </span>
      )}
    </div>
  )
}
