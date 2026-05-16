/**
 * 📭 沈翔学校 - 空状态组件 (Empty State)
 * 
 * 通用的空状态展示组件。
 */

"use client"

import { cn } from "@/lib/utils"
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
    iconBg: "bg-primary/10",
    iconColor: "text-primary"
  },
  files: {
    icon: FileText,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-500"
  },
  search: {
    icon: Search,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-500"
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
      "flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/80 text-center shadow-sm",
      compact ? "py-8 px-4" : "py-16 px-4",
      className
    )}>
      {/* 图标 */}
      <div className={cn(
        "rounded-2xl flex items-center justify-center mb-4 shadow-sm",
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
        "font-semibold text-foreground mb-1",
        compact ? "text-base" : "text-lg"
      )}>
        {title}
      </h3>

      {/* 描述 */}
      {description && (
        <p className={cn(
          "text-muted-foreground max-w-md leading-6",
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
                "inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                compact ? "px-3 py-1.5 text-sm" : "px-4 py-2"
              )}
            >
              {ActionIcon && <ActionIcon className="w-4 h-4" />}
              {action.label}
            </button>
          )}

          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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
