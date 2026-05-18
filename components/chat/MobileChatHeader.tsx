import {
  DropdownMenuV2 as DropdownMenu,
  DropdownMenuV2Content as DropdownMenuContent,
  DropdownMenuV2Item as DropdownMenuItem,
  DropdownMenuV2Separator as DropdownMenuSeparator,
  DropdownMenuV2Trigger as DropdownMenuTrigger
} from "@/components/ui/v2"
/**
 * 📱 沈翔学校 - 移动端聊天头部组件 (Mobile Chat Header)
 * 
 * 移动端聊天页面的顶部导航栏。
 */

"use client"

import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ChevronLeft, MoreVertical, Trash2 } from "lucide-react"
import { IconSettings, IconShare } from "@/components/icons/v2"
import { cn } from "@/lib/utils"

// ============================================
// 类型定义
// ============================================

interface MobileChatHeaderProps {
  /** 当前模型名称 */
  modelName: string
  /** 模型图标 */
  modelIcon?: React.ReactNode
  /** 模型颜色 */
  modelColor?: string
  /** 是否正在加载 */
  isLoading?: boolean
  /** 清空对话回调 */
  onClearChat?: () => void
  /** 分享回调 */
  onShare?: () => void
  /** 设置回调 */
  onSettings?: () => void
  /** 自定义返回路径 */
  backPath?: string
  /** 自定义类名 */
  className?: string
}

// ============================================
// 移动端聊天头部组件
// ============================================

export function MobileChatHeader({
  modelName,
  modelIcon,
  modelColor = "var(--ink-700)",
  isLoading = false,
  onClearChat,
  onShare,
  onSettings,
  backPath = "/",
  className
}: MobileChatHeaderProps) {
  const router = useRouter()

  const handleBack = () => {
    router.push(backPath)
  }

  return (
    <header 
      className={cn(
        "flex items-center h-14 px-2 border-b border-[var(--paper-200)] bg-[var(--paper-50)]/85 backdrop-blur-md",
        "sticky top-0 z-30 pt-safe shrink-0",
        "md:hidden",
        className
      )}
    >
      {/* 返回按钮 */}
      <motion.button 
        onClick={handleBack}
        className="flex items-center gap-0.5 text-[var(--ink-600)] hover:text-[var(--ink-800)] transition-colors p-2 -ml-1 rounded-[var(--radius-soft)] active:bg-[var(--paper-100)]"
        whileTap={{ scale: 0.95 }}
      >
        <ChevronLeft className="h-5 w-5" />
        <span className="text-sm font-medium">返回</span>
      </motion.button>
      
      {/* 中间标题区域 */}
      <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
        {modelIcon && (
          <span 
            className="flex items-center justify-center w-6 h-6 rounded-[var(--radius-soft)]"
            style={{ backgroundColor: `${modelColor}15` }}
          >
            <span style={{ color: modelColor }}>{modelIcon}</span>
          </span>
        )}
        <div className="flex flex-col items-center min-w-0">
          <span className="font-[var(--font-display)] text-[16px] font-bold text-[var(--ink-800)] truncate max-w-[140px]">
            {modelName}
          </span>
          {isLoading && (
            <motion.span 
              className="text-[10px] text-[var(--ink-400)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              正在输入...
            </motion.span>
          )}
        </div>
      </div>
      
      {/* 右侧操作按钮 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <motion.button 
            className="p-2 text-[var(--ink-500)] hover:text-[var(--ink-600)] rounded-[var(--radius-soft)] hover:bg-[var(--paper-100)] transition-colors"
            whileTap={{ scale: 0.95 }}
          >
            <MoreVertical className="h-5 w-5" />
          </motion.button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {onClearChat && (
            <DropdownMenuItem onClick={onClearChat} className="text-[var(--seal-500)]">
              <Trash2 className="w-4 h-4 mr-2" />
              清空对话
            </DropdownMenuItem>
          )}
          {onShare && (
            <DropdownMenuItem onClick={onShare}>
              <IconShare className="w-4 h-4 mr-2" />
              分享对话
            </DropdownMenuItem>
          )}
          {(onClearChat || onShare) && onSettings && <DropdownMenuSeparator />}
          {onSettings && (
            <DropdownMenuItem onClick={onSettings}>
              <IconSettings className="w-4 h-4 mr-2" />
              设置
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}

// ============================================
// 简化版头部（无下拉菜单）
// ============================================

interface SimpleChatHeaderProps {
  title: string
  subtitle?: string
  backPath?: string
  rightAction?: React.ReactNode
  className?: string
}

export function SimpleChatHeader({
  title,
  subtitle,
  backPath = "/",
  rightAction,
  className
}: SimpleChatHeaderProps) {
  const router = useRouter()

  return (
    <header 
      className={cn(
        "flex items-center h-14 px-2 border-b border-[var(--paper-200)] bg-[var(--paper-50)]/85 backdrop-blur-md",
        "sticky top-0 z-30 pt-safe shrink-0",
        "md:hidden",
        className
      )}
    >
      <motion.button 
        onClick={() => router.push(backPath)}
        className="flex items-center gap-0.5 text-[var(--ink-600)] hover:text-[var(--ink-800)] transition-colors p-2 -ml-1 rounded-[var(--radius-soft)] active:bg-[var(--paper-100)]"
        whileTap={{ scale: 0.95 }}
      >
        <ChevronLeft className="h-5 w-5" />
        <span className="text-sm font-medium">返回</span>
      </motion.button>
      
      <div className="flex-1 flex flex-col items-center justify-center min-w-0">
        <span className="font-[var(--font-display)] text-[16px] font-bold text-[var(--ink-800)] truncate max-w-[160px]">
          {title}
        </span>
        {subtitle && (
          <span className="text-[10px] text-[var(--ink-400)] truncate max-w-[140px]">
            {subtitle}
          </span>
        )}
      </div>
      
      <div className="w-16 flex justify-end">
        {rightAction}
      </div>
    </header>
  )
}

// ============================================
// 默认导出
// ============================================

export default MobileChatHeader
