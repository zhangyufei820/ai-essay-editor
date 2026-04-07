/**
 * 💳 Loading State Card - Claude Code 风格 Thinking 动画
 *
 * - SVG 多粒子脉冲动画，带 cubic-bezier 非线性节奏
 * - 科技感光晕效果，呈现 AI 深度思考状态
 * - 第一个字吐出时通过 CSS opacity 切换丝滑消失
 */

"use client"

import React from "react"
import { easing } from "@/lib/design-tokens"

// ============================================
// SVG 粒子动画常量
// ============================================

const PARTICLE_COUNT = 6
const PARTICLE_RADIUS = 10
const PARTICLE_CENTER_X = 20
const PARTICLE_CENTER_Y = 12
const PARTICLE_ANIMATION_DURATION = "1.4s"
const PARTICLE_STAGGER_CYCLE = 1.2 // seconds for full stagger cycle

// 预计算粒子位置和动画延迟（模块级别常量，避免每次渲染重算）
const PARTICLE_DATA = Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
  const angle = ((i / PARTICLE_COUNT) * Math.PI * 2) - Math.PI / 2
  return {
    x: PARTICLE_CENTER_X + PARTICLE_RADIUS * Math.cos(angle),
    y: PARTICLE_CENTER_Y + PARTICLE_RADIUS * Math.sin(angle),
    delay: (i / PARTICLE_COUNT) * PARTICLE_STAGGER_CYCLE,
  }
})

// ============================================
// Claude Code 风格 SVG 粒子动画
// ============================================

function ClaudeThinkingDots() {
  return (
    <svg
      width="40"
      height="24"
      viewBox="0 0 40 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#10A37F" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10A37F" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 背景光晕 */}
      <ellipse
        cx={PARTICLE_CENTER_X}
        cy={PARTICLE_CENTER_Y}
        rx={PARTICLE_RADIUS + 4}
        ry={PARTICLE_RADIUS + 4}
        fill="url(#glow)"
        className="animate-pulse"
        style={{
          animationDuration: "2s",
          animationTimingFunction: easing.spring,
          animationIterationCount: "infinite",
          animationDelay: "0s",
        }}
      />

      {/* 6 个粒子点 — 预计算位置和延迟 */}
      {PARTICLE_DATA.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={2}
          fill="#10A37F"
          style={{
            animationName: "particlePulse",
            animationDuration: PARTICLE_ANIMATION_DURATION,
            animationTimingFunction: easing.spring,
            animationIterationCount: "infinite",
            animationDelay: `${p.delay}s`,
            animationFillMode: "both",
          }}
        />
      ))}
    </svg>
  )
}

// ============================================
// LoadingStateCard Component
// ============================================

export function LoadingStateCard({
  modelKey = "standard",
  className,
  showHint = false,
}: LoadingStateCardProps) {
  return (
    <div
      className={`inline-flex flex-col gap-1 ${className || ""}`}
      role="status"
      aria-label={showHint ? "AI 正在深度思考中" : "AI 思考中"}
    >
      <div className="inline-flex items-center gap-2">
        {/* SVG 粒子动画 */}
        <ClaudeThinkingDots />

        {/* 思考文字 */}
        <span className="text-xs text-slate-400 font-normal tracking-wide leading-none">
          {showHint ? "AI 正在深度思考中..." : "Thinking..."}
        </span>
      </div>

      {/* 深度提示行 */}
      {showHint && (
        <span className="text-xs text-slate-400 font-normal tracking-wide ml-10 leading-none">
          这可能需要一点时间，请耐心等待...
        </span>
      )}
    </div>
  )
}
