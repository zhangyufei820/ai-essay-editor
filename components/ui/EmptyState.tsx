/**
 * 📭 沈翔学校 - 空状态组件 (Empty State)
 * 
 * 通用的空状态展示组件。
 */

"use client"

import { cn } from "@/lib/utils"
import { brandColors } from "@/lib/design-tokens"
import { LucideIcon, Inbox, FileText, MessageSquare, Search, Users, Calendar } from "lucide-react"

// ============================================
// 类型定义
// ============================================

type EmptyType = "default" | "messages" | "files" | "search" | "users" | "events"

interface EmptyStateProps {
  /** 空状态类型 */
  type?: EmptyType
  /** 自定义图标 */
  icon?: LucideIcon
  /** 标题 */
  title: string
  /** 描述 */
  description?: string
  /** 操作按钮 */
  action?: {
    label: string
    onClick: () => void
    icon?: LucideIcon
  }
  /** 次要操作 */
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  /** 自定义类名 */
  className?: string
  /** 紧凑模式 */
  compact?: boolean
}

// ============================================
// 空状态配置
// ============================================

const emptyConfig: Record<EmptyType, { icon: LucideIcon; iconBg: string; iconColor: string }> = {
  default: {
    icon: Inbox,
    iconBg: "bg-slate-100",
    iconColor: "text-slate-400"
  },
  messages: {
    icon: MessageSquare,
    iconBg: `bg-[${brandColors[50]}]`,
    iconColor: `text-[${brandColors[600]}]`
  },
  files: {
    icon: FileText,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-500"
  },
  search: {
    icon: Search,
    iconBg: "bg-purple-50",
    iconColor: "text-purple-500"
  },
  users: {
    icon: Users,
    iconBg: "bg-orange-50",
    iconColor: "text-orange-500"
  },
  events: {
    icon: Calendar,
    iconBg: "bg-green-50",
    iconColor: "text-green-500"
  }
}

// ============================================
// 空状态组件
// ============================================

export function EmptyState({
  type = "default",
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  compact = false
}: EmptyStateProps) {
  const config = emptyConfig[type]
  const Icon = icon || config.icon
  const ActionIcon = action?.icon

  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center",
      compact ? "py-8 px-4" : "py-16 px-4",
      className
    )}>
      {/* 图标 */}
      <div className={cn(
        "rounded-full flex items-center justify-center mb-4",
        compact ? "w-12 h-12" : "w-16 h-16",
        config.iconBg
      )}>
        <Icon className={cn(
          config.iconColor,
          compact ? "w-6 h-6" : "w-8 h-8"
        )} />
      </div>

      {/* 标题 */}
      <h3 className={cn(
        "font-semibold text-slate-800 mb-1",
        compact ? "text-base" : "text-lg"
      )}>
        {title}
      </h3>

      {/* 描述 */}
      {description && (
        <p className={cn(
          "text-slate-500 max-w-md",
          compact ? "text-sm mb-4" : "text-base mb-6"
        )}>
          {description}
        </p>
      )}

      {/* 操作按钮 */}
      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {action && (
            <button
              onClick={action.onClick}
              className={cn(
                "inline-flex items-center gap-2 text-white rounded-xl hover:opacity-90 transition-colors",
                compact ? "px-3 py-1.5 text-sm" : "px-4 py-2"
              )}
              style={{ backgroundColor: brandColors[900] }}
            >
              {ActionIcon && <ActionIcon className="w-4 h-4" />}
              {action.label}
            </button>
          )}

          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className={cn(
                "inline-flex items-center gap-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors",
                compact ? "px-3 py-1.5 text-sm" : "px-4 py-2"
              )}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================
// 默认导出
// ============================================

export default EmptyState
