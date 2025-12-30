/**
 * ⚠️ 沈翔学校 - 错误状态组件 (Error State)
 * 
 * 通用的错误状态展示组件。
 */

"use client"

import { AlertCircle, RefreshCw, Home, ArrowLeft, WifiOff, ServerCrash, Lock } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { brandColors } from "@/lib/design-tokens"

// ============================================
// 类型定义
// ============================================

type ErrorType = "default" | "network" | "server" | "auth" | "notFound"

interface ErrorStateProps {
  /** 错误类型 */
  type?: ErrorType
  /** 自定义标题 */
  title?: string
  /** 自定义描述 */
  description?: string
  /** 显示刷新按钮 */
  showRefresh?: boolean
  /** 显示首页按钮 */
  showHome?: boolean
  /** 显示返回按钮 */
  showBack?: boolean
  /** 重试回调 */
  onRetry?: () => void
  /** 自定义类名 */
  className?: string
}

// ============================================
// 错误配置
// ============================================

const errorConfig: Record<ErrorType, { icon: typeof AlertCircle; title: string; description: string; iconBg: string; iconColor: string }> = {
  default: {
    icon: AlertCircle,
    title: "出了点问题",
    description: "请稍后再试",
    iconBg: "bg-red-50",
    iconColor: "text-red-500"
  },
  network: {
    icon: WifiOff,
    title: "网络连接失败",
    description: "请检查您的网络连接后重试",
    iconBg: "bg-orange-50",
    iconColor: "text-orange-500"
  },
  server: {
    icon: ServerCrash,
    title: "服务器开小差了",
    description: "我们正在努力修复，请稍后再试",
    iconBg: "bg-purple-50",
    iconColor: "text-purple-500"
  },
  auth: {
    icon: Lock,
    title: "需要登录",
    description: "请登录后继续操作",
    iconBg: "bg-blue-50",
    iconColor: "text-blue-500"
  },
  notFound: {
    icon: AlertCircle,
    title: "内容不存在",
    description: "您访问的内容可能已被删除或移动",
    iconBg: "bg-slate-100",
    iconColor: "text-slate-500"
  }
}

// ============================================
// 错误状态组件
// ============================================

export function ErrorState({
  type = "default",
  title,
  description,
  showRefresh = true,
  showHome = false,
  showBack = false,
  onRetry,
  className
}: ErrorStateProps) {
  const router = useRouter()
  const config = errorConfig[type]
  const Icon = config.icon

  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-16 px-4 text-center",
      className
    )}>
      {/* 图标 */}
      <div className={cn(
        "w-16 h-16 rounded-full flex items-center justify-center mb-6",
        config.iconBg
      )}>
        <Icon className={cn("w-8 h-8", config.iconColor)} />
      </div>

      {/* 标题 */}
      <h2 className="text-xl font-semibold text-slate-800 mb-2">
        {title || config.title}
      </h2>

      {/* 描述 */}
      <p className="text-slate-500 mb-8 max-w-md">
        {description || config.description}
      </p>

      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {showRefresh && (
          <button
            onClick={onRetry || (() => window.location.reload())}
            className="inline-flex items-center gap-2 px-4 py-2 text-white rounded-xl hover:opacity-90 transition-colors"
            style={{ backgroundColor: brandColors[900] }}
          >
            <RefreshCw className="w-4 h-4" />
            重试
          </button>
        )}

        {showBack && (
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </button>
        )}

        {showHome && (
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors"
          >
            <Home className="w-4 h-4" />
            回到首页
          </button>
        )}

        {type === "auth" && (
          <button
            onClick={() => router.push("/login")}
            className="inline-flex items-center gap-2 px-4 py-2 text-white rounded-xl hover:opacity-90 transition-colors"
            style={{ backgroundColor: brandColors[900] }}
          >
            去登录
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================
// 默认导出
// ============================================

export default ErrorState
