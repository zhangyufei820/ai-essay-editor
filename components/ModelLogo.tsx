"use client"

import React from "react"

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
  /** 是否使用本地 SVG */
  useLocal?: boolean
  /** 主色（用于图标背景或备用图标着色） */
  brandColor?: string
  /** 首字母（用于无 SVG 时显示） */
  initials?: string
  /** SVG 着色滤镜（用于匹配墨绿色主题） */
  svgFilter?: string
}

// ============================================
// Logo 映射配置 - 适配墨绿色主题
// ============================================

const MODEL_LOGOS: Record<ModelKey, ModelLogoConfig> = {
  // 官方模型 Logo - 使用滤镜将白色/SVG颜色转换为墨绿色系
  "gpt-5": {
    svgPath: "/logos/chatgpt-icon.svg",
    useLocal: true,
    brandColor: "#15803D", // 墨绿色
    svgFilter: undefined,
  },
  "claude-opus": {
    svgPath: "/logos/claude-ai-icon.svg",
    useLocal: true,
    brandColor: "#15803D", // 墨绿色
    svgFilter: undefined,
  },
  "gemini-pro": {
    svgPath: "/logos/google-gemini-icon.svg",
    useLocal: true,
    brandColor: "#15803D", // 墨绿色
    svgFilter: undefined,
  },
  "grok-4.2": {
    svgPath: "/logos/grok-icon.svg",
    useLocal: true,
    brandColor: "#15803D", // 墨绿色
    svgFilter: undefined,
  },

  // 教育类智能体 - 墨绿色系
  "standard": {
    brandColor: "#15803D",
    initials: "作",
  },
  "teaching-pro": {
    brandColor: "#15803D",
    initials: "教",
  },
  "quanquan-math": {
    brandColor: "#15803D",
    initials: "数",
  },
  "quanquan-english": {
    brandColor: "#15803D",
    initials: "英",
  },
  "beike-pro": {
    brandColor: "#15803D",
    initials: "备",
  },
  "banzhuren": {
    brandColor: "#15803D",
    initials: "班",
  },

  // 创意生成类
  "banana-2-pro": {
    brandColor: "#15803D",
    initials: "图",
  },
  "suno-v5": {
    brandColor: "#15803D",
    initials: "音",
  },
  "sora-2-pro": {
    brandColor: "#15803D",
    initials: "影",
  },

  // 其他
  "open-claw": {
    brandColor: "#15803D",
    initials: "OC",
  },
}

// ============================================
// 尺寸配置
// ============================================

type LogoSize = "xs" | "sm" | "md" | "lg" | "xl"

interface LogoSizeConfig {
  container: string
  iconSize: number
  fontSize: number
}

const LOGO_SIZES: Record<LogoSize, LogoSizeConfig> = {
  xs: { container: "w-5 h-5", iconSize: 12, fontSize: 7 },
  sm: { container: "w-6 h-6", iconSize: 14, fontSize: 8 },
  md: { container: "w-8 h-8", iconSize: 18, fontSize: 10 },
  lg: { container: "w-10 h-10", iconSize: 22, fontSize: 12 },
  xl: { container: "w-14 h-14", iconSize: 32, fontSize: 16 },
}

// ============================================
// ModelLogo 组件 - 适配墨绿色主题
// ============================================

interface ModelLogoProps {
  modelKey: ModelKey
  size?: LogoSize
  /** 是否显示背景（默认 sm 以下无背景） */
  showBg?: boolean
  className?: string
  style?: React.CSSProperties
}

/**
 * AI 模型 Logo 组件 - 墨绿色主题
 * - 官方模型：使用本地 SVG + 墨绿色滤镜
 * - 其他模型：墨绿色背景 + 首字母
 */
export function ModelLogo({
  modelKey,
  size = "md",
  showBg = size === "md" || size === "lg" || size === "xl",
  className,
  style
}: ModelLogoProps) {
  const config = MODEL_LOGOS[modelKey]
  const sizeConfig = LOGO_SIZES[size]
  const brandColor = config?.brandColor || "#15803D"

  // 有本地 SVG - 需要添加背景色使白色SVG可见，暗黑模式下增强对比度
  if (config?.svgPath) {
    return (
      <div
        className={`flex items-center justify-center shrink-0 rounded-lg ${sizeConfig.container} ${className || ""} dark:bg-[#10A37F]/20 dark:border-[#10A37F]/40`}
        style={{
          backgroundColor: `${brandColor}30`,
          border: `1px solid ${brandColor}50`,
          ...style,
        }}
      >
        <img
          src={config.svgPath}
          alt={modelKey}
          width={sizeConfig.iconSize}
          height={sizeConfig.iconSize}
          className="object-contain dark:brightness-0 dark:invert"
          style={{
            imageRendering: "-webkit-optimize-contrast",
            filter: config.svgFilter || "none",
          }}
        />
      </div>
    )
  }

  // 无 SVG，使用首字母
  return (
    <div
      className={`flex items-center justify-center rounded-md ${sizeConfig.container} ${className || ""}`}
      style={
        showBg
          ? {
              backgroundColor: `${brandColor}15`,
              border: `1px solid ${brandColor}30`,
              ...style,
            }
          : style
      }
    >
      <span
        style={{
          color: brandColor,
          fontWeight: 600,
          fontSize: sizeConfig.fontSize,
          lineHeight: 1,
        }}
      >
        {config?.initials || modelKey.slice(0, 2).toUpperCase()}
      </span>
    </div>
  )
}

// ============================================
// ModelLogoWithBg 组件 - 带背景版本
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
  return (
    <ModelLogo
      modelKey={modelKey}
      size={size}
      showBg={true}
      className={className}
      style={style}
    />
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
  agent: { modelKey: "open-claw", showBg: true },
  education: { modelKey: "teaching-pro", showBg: true },
  "ai-model": { modelKey: "gpt-5", showBg: true },
  creative: { modelKey: "banana-2-pro", showBg: true },
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
