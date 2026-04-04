"use client"

import React from "react"
import {
  FileCheck2,
  Sparkles,
  Calculator,
  Languages,
  LayoutDashboard,
  UsersRound,
  type LucideProps,
} from "lucide-react"

// ============================================
// AI 模型 Logo 映射表
// ============================================

export type ModelKey =
  | "standard"
  | "teaching-pro"
  | "gpt-5"
  | "claude-opus"
  | "gemini-pro"
  | "grok-4.2"
  | "open-claw"
  | "quanquan-math"
  | "quanquan-english"
  | "beike-pro"
  | "banzhuren"
  | "banana-2-pro"
  | "suno-v5"
  | "sora-2-pro"

interface ModelLogoConfig {
  /** SVG 文件路径（本地 /public 路径） */
  svgPath?: string
  /** 使用本地 SVG */
  useLocal?: boolean
  /** 主色 */
  brandColor?: string
  /** Lucide 图标组件 */
  LucideIcon?: React.FC<LucideProps>
  /** Lucide 图标尺寸 */
  lucideSize?: number
}

// ============================================
// Logo 映射配置 - 统一使用 Lucide 线性图标 + 沈翔绿主色
// ============================================

const MODEL_LOGOS: Record<ModelKey, ModelLogoConfig> = {
  // 官方模型 Logo - 使用本地 SVG（无背景，纯 logo）
  "gpt-5": {
    svgPath: "/logos/chatgpt-icon.svg",
    useLocal: true,
    brandColor: "#10A37F",
  },
  "claude-opus": {
    svgPath: "/logos/claude-ai-icon.svg",
    useLocal: true,
    brandColor: "#10A37F",
  },
  "gemini-pro": {
    svgPath: "/logos/google-gemini-icon.svg",
    useLocal: true,
    brandColor: "#10A37F",
  },
  "grok-4.2": {
    svgPath: "/logos/grok-icon.svg",
    useLocal: true,
    brandColor: "#10A37F",
  },

  // 教育类智能体 - 使用 Lucide 线性图标，无背景
  "standard": {
    LucideIcon: FileCheck2,
    brandColor: "#10A37F",
  },
  "teaching-pro": {
    LucideIcon: Sparkles,
    brandColor: "#10A37F",
  },
  "quanquan-math": {
    LucideIcon: Calculator,
    brandColor: "#10A37F",
  },
  "quanquan-english": {
    LucideIcon: Languages,
    brandColor: "#10A37F",
  },
  "beike-pro": {
    LucideIcon: LayoutDashboard,
    brandColor: "#10A37F",
  },
  "banzhuren": {
    LucideIcon: UsersRound,
    brandColor: "#10A37F",
  },

  // 创意生成类
  "banana-2-pro": {
    LucideIcon: Sparkles,
    brandColor: "#10A37F",
  },
  "suno-v5": {
    LucideIcon: Sparkles,
    brandColor: "#10A37F",
  },
  "sora-2-pro": {
    LucideIcon: Sparkles,
    brandColor: "#10A37F",
  },

  // 其他
  "open-claw": {
    LucideIcon: Sparkles,
    brandColor: "#10A37F",
  },
}

// ============================================
// 尺寸配置
// ============================================

type LogoSize = "xs" | "sm" | "md" | "lg" | "xl"

interface LogoSizeConfig {
  container: string
  iconSize: number
}

const LOGO_SIZES: Record<LogoSize, LogoSizeConfig> = {
  xs: { container: "w-5 h-5", iconSize: 12 },
  sm: { container: "w-6 h-6", iconSize: 14 },
  md: { container: "w-8 h-8", iconSize: 18 },
  lg: { container: "w-10 h-10", iconSize: 22 },
  xl: { container: "w-14 h-14", iconSize: 32 },
}

// ============================================
// ModelLogo 组件 - 统一使用 Lucide 线性图标 + 沈翔绿主色
// ============================================

interface ModelLogoProps {
  modelKey: ModelKey
  size?: LogoSize
  /** 是否显示背景（默认无背景） */
  showBg?: boolean
  className?: string
  style?: React.CSSProperties
}

/**
 * AI 模型 Logo 组件 - 沈翔绿主题
 * - 所有 logo 统一使用线性图标风格
 * - 无背景，纯色图标
 * - 颜色统一使用 #10A37F
 */
export function ModelLogo({
  modelKey,
  size = "md",
  showBg = false,
  className,
  style
}: ModelLogoProps) {
  const config = MODEL_LOGOS[modelKey]
  const sizeConfig = LOGO_SIZES[size]
  const brandColor = config?.brandColor || "#10A37F"

  // 有本地 SVG - 纯 SVG logo，显示原始颜色
  if (config?.svgPath && config?.useLocal) {
    return (
      <div
        className={`flex items-center justify-center shrink-0 ${className || ""}`}
        style={style}
      >
        <img
          src={config.svgPath}
          alt={`${modelKey.replace(/-/g, ' ')} logo`}
          width={sizeConfig.iconSize}
          height={sizeConfig.iconSize}
          className="object-contain"
        />
      </div>
    )
  }

  // 使用 Lucide 图标 - 纯图标，无背景
  if (config?.LucideIcon) {
    const IconComponent = config.LucideIcon
    return (
      <div
        className={`flex items-center justify-center shrink-0 ${className || ""}`}
        style={style}
      >
        <IconComponent
          size={sizeConfig.iconSize}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: brandColor }}
        />
      </div>
    )
  }

  // Fallback - 纯图标无背景
  return (
    <div
      className={`flex items-center justify-center shrink-0 ${className || ""}`}
      style={style}
    >
      <Sparkles
        size={sizeConfig.iconSize}
        strokeWidth={2}
        strokeLinecap="round"
        style={{ color: brandColor }}
      />
    </div>
  )
}

// ============================================
// ModelLogoWithBg 组件 - 带背景版本（保留用于特殊场景）
// ============================================

interface ModelLogoWithBgProps {
  modelKey: ModelKey
  size?: LogoSize
  className?: string
  style?: React.CSSProperties
}

export function ModelLogoWithBg({
  modelKey,
  size = "md",
  className,
  style
}: ModelLogoWithBgProps) {
  const config = MODEL_LOGOS[modelKey]
  const sizeConfig = LOGO_SIZES[size]
  const brandColor = config?.brandColor || "#10A37F"

  // 有本地 SVG - 带淡绿背景
  if (config?.svgPath && config?.useLocal) {
    return (
      <div
        className={`flex items-center justify-center shrink-0 rounded-lg ${sizeConfig.container} ${className || ""}`}
        style={{
          backgroundColor: `${brandColor}15`,
          border: `1px solid ${brandColor}30`,
          ...style,
        }}
      >
        <img
          src={config.svgPath}
          alt={`${modelKey.replace(/-/g, ' ')} logo`}
          width={sizeConfig.iconSize}
          height={sizeConfig.iconSize}
          className="object-contain"
        />
      </div>
    )
  }

  // 使用 Lucide 图标 - 带淡绿背景
  if (config?.LucideIcon) {
    const IconComponent = config.LucideIcon
    return (
      <div
        className={`flex items-center justify-center shrink-0 rounded-lg ${sizeConfig.container} ${className || ""}`}
        style={{
          backgroundColor: `${brandColor}15`,
          border: `1px solid ${brandColor}30`,
          ...style,
        }}
      >
        <IconComponent
          size={sizeConfig.iconSize}
          strokeWidth={2}
          strokeLinecap="round"
          style={{ color: brandColor }}
        />
      </div>
    )
  }

  // Fallback
  return (
    <div
      className={`flex items-center justify-center shrink-0 rounded-lg ${sizeConfig.container} ${className || ""}`}
      style={{
        backgroundColor: `${brandColor}15`,
        border: `1px solid ${brandColor}30`,
        ...style,
      }}
    >
      <Sparkles
        size={sizeConfig.iconSize}
        strokeWidth={2}
        style={{ color: brandColor }}
      />
    </div>
  )
}

// ============================================
// SectionLogo 组件 - 用于侧边栏分区图标
// ============================================

interface SectionLogoProps {
  /** 分区类型 */
  type: "agent" | "education" | "ai-model" | "creative"
  size?: LogoSize
  className?: string
  style?: React.CSSProperties
}

const SECTION_CONFIG: Record<string, { modelKey: ModelKey; showBg: boolean }> = {
  agent: { modelKey: "open-claw", showBg: false },
  education: { modelKey: "teaching-pro", showBg: false },
  "ai-model": { modelKey: "gpt-5", showBg: false },
  creative: { modelKey: "banana-2-pro", showBg: false },
}

export function SectionLogo({ type, size = "sm", className, style }: SectionLogoProps) {
  const config = SECTION_CONFIG[type]
  if (!config) return null

  return (
    <ModelLogo
      modelKey={config.modelKey}
      size={size}
      showBg={config.showBg}
      className={className}
      style={style}
    />
  )
}

// ============================================
// 导出配置供其他组件使用
// ============================================

export { MODEL_LOGOS }
