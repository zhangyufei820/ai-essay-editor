/**
 * 🎨 沈翔学校 - 品牌标识组件 (Logo)
 * 
 * 支持多种尺寸和变体的品牌标识。
 */

import { cn } from "@/lib/utils"
import { brandColors } from "@/lib/design-tokens"

// ============================================
// 类型定义
// ============================================

interface LogoProps {
  /** 尺寸：sm | md | lg | xl */
  size?: "sm" | "md" | "lg" | "xl"
  /** 变体：full（图标+文字）| icon（仅图标）| text（仅文字） */
  variant?: "full" | "icon" | "text"
  /** 自定义类名 */
  className?: string
}

// ============================================
// 尺寸映射
// ============================================

const sizeMap = {
  sm: { icon: 24, text: 14, gap: 6 },
  md: { icon: 32, text: 18, gap: 8 },
  lg: { icon: 40, text: 22, gap: 10 },
  xl: { icon: 56, text: 28, gap: 12 },
} as const

// ============================================
// Logo 图标 SVG
// ============================================

function LogoIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("transition-transform duration-300 hover:scale-105", className)}
    >
      {/* 抽象智慧符号 - 书本与光芒的结合 */}
      <defs>
        <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={brandColors[900]} />
          <stop offset="100%" stopColor={brandColors[700]} />
        </linearGradient>
      </defs>
      
      {/* 外圈 - 代表完整的知识体系 */}
      <circle
        cx="24"
        cy="24"
        r="22"
        stroke="url(#logoGradient)"
        strokeWidth="2"
        fill="none"
        opacity="0.2"
      />
      
      {/* 书本形状 - 代表学习 */}
      <path
        d="M12 14C12 12.8954 12.8954 12 14 12H22C23.1046 12 24 12.8954 24 14V34C24 35.1046 23.1046 36 22 36H14C12.8954 36 12 35.1046 12 34V14Z"
        fill="url(#logoGradient)"
        opacity="0.9"
      />
      <path
        d="M24 14C24 12.8954 24.8954 12 26 12H34C35.1046 12 36 12.8954 36 14V34C36 35.1046 35.1046 36 34 36H26C24.8954 36 24 35.1046 24 34V14Z"
        fill="url(#logoGradient)"
        opacity="0.7"
      />
      
      {/* 中间的光芒 - 代表智慧的光 */}
      <path
        d="M24 8V12"
        stroke={brandColors[900]}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M24 36V40"
        stroke={brandColors[900]}
        strokeWidth="2"
        strokeLinecap="round"
      />
      
      {/* 书页线条 */}
      <path
        d="M15 18H21"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.8"
      />
      <path
        d="M15 22H21"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M15 26H19"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.4"
      />
      
      <path
        d="M27 18H33"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M27 22H33"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.4"
      />
      <path
        d="M27 26H31"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.3"
      />
    </svg>
  )
}

// ============================================
// Logo 文字
// ============================================

function LogoText({ size, className }: { size: number; className?: string }) {
  return (
    <span
      className={cn(
        "font-semibold tracking-tight transition-colors duration-300",
        className
      )}
      style={{
        fontSize: `${size}px`,
        color: brandColors[900],
      }}
    >
      沈翔学校
    </span>
  )
}

// ============================================
// Logo 主组件
// ============================================

export function Logo({ size = "md", variant = "full", className }: LogoProps) {
  const dimensions = sizeMap[size]

  if (variant === "icon") {
    return (
      <div className={cn("inline-flex items-center", className)}>
        <LogoIcon size={dimensions.icon} />
      </div>
    )
  }

  if (variant === "text") {
    return (
      <div className={cn("inline-flex items-center", className)}>
        <LogoText size={dimensions.text} />
      </div>
    )
  }

  // variant === "full"
  return (
    <div
      className={cn("inline-flex items-center", className)}
      style={{ gap: `${dimensions.gap}px` }}
    >
      <LogoIcon size={dimensions.icon} />
      <LogoText size={dimensions.text} />
    </div>
  )
}

// 默认导出
export default Logo
