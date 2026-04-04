/**
 * 🎯 GenSpark 1:1 像素级复刻 - 思考抽屉组件 (Thought Drawer)
 * 
 * 严格复刻 GenSpark/Perplexity 的 "顶部极简折叠抽屉" 结构
 * 
 * 设计规范：
 * - 折叠态：高度约 36-40px，极简单行，浅灰/浅绿背景
 * - 展开态：极简垂直列表（无卡片背景，无阴影，无边框）
 * - 配色：bg-gray-50 或 bg-emerald-50/30，文字 text-gray-500/600
 * - 禁止显示"总编辑"、"快速回复"等触发节点
 * 
 * 🔥 关键：删除所有卡片/时间轴样式，只保留极简列表
 */

"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, ChevronDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { 
  WorkflowState, 
  WorkflowNodeStatus,
  getCompletedCount,
  getCurrentRunningNode
} from "@/lib/workflow-visual-config"

// ============================================
// 类型定义
// ============================================

interface ThoughtDrawerProps {
  workflowState: WorkflowState
  isThinking: boolean
  isGenerating: boolean
  onToggle: () => void
  currentRunningText?: string
  className?: string
}

// ============================================
// 单个思考步骤项 - 极简风格（无卡片，无阴影）
// ============================================

interface ThoughtItemProps {
  label: string
  status: WorkflowNodeStatus
  icon: React.ComponentType<{ className?: string }>
  index: number
}

const ThoughtItem: React.FC<ThoughtItemProps> = React.memo(({ label, status, icon: Icon, index }) => {
  const isCompleted = status === "completed"
  const isRunning = status === "running"
  
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      {/* 状态图标 */}
      {isCompleted ? (
        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500">
          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
        </div>
      ) : isRunning ? (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="flex h-4 w-4 items-center justify-center"
        >
          <Loader2 className="h-3.5 w-3.5 text-emerald-600" />
        </motion.div>
      ) : (
        <div className="flex h-4 w-4 items-center justify-center">
          <Icon className="h-3.5 w-3.5 text-gray-300" />
        </div>
      )}
      
      {/* 步骤名称 */}
      <span className={cn(
        "text-sm",
        isCompleted && "text-gray-600",
        isRunning && "text-emerald-600 font-medium",
        !isCompleted && !isRunning && "text-gray-400"
      )}>
        {label}
      </span>
    </li>
  )
})

// ============================================
// 主组件 - GenSpark 风格极简抽屉
// ============================================

export const ThoughtDrawer: React.FC<ThoughtDrawerProps> = ({
  workflowState,
  isThinking,
  isGenerating,
  onToggle,
  currentRunningText,
  className
}) => {
  const { nodes, isExpanded } = workflowState
  const completedCount = getCompletedCount(nodes)
  const runningNode = getCurrentRunningNode(nodes)
  
  // 🔥 快速通道模式或无节点时，不显示抽屉
  if (workflowState.isFastTrack || (!isThinking && !isGenerating && nodes.length === 0)) {
    return null
  }

  // 获取折叠态显示文本
  const getStatusText = () => {
    if (isGenerating) {
      return "已完成深度分析"
    }
    if (currentRunningText) {
      return currentRunningText
    }
    if (runningNode) {
      return runningNode.config.runningTexts?.[0] || `正在${runningNode.config.label}...`
    }
    if (completedCount > 0) {
      return `已完成 ${completedCount} 个分析步骤`
    }
    return "" // 移除"正在分析中..."
  }

  // 获取耗时显示（可选）
  const getElapsedTime = () => {
    if (!workflowState.startTime) return null
    const elapsed = Math.round((Date.now() - workflowState.startTime) / 1000)
    if (elapsed < 1) return null
    return `${elapsed}s`
  }

  const elapsedTime = getElapsedTime()

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15 }}
      className={cn(
        // 🔥 极简样式：浅灰/浅绿背景，圆角，无阴影
        "rounded-lg bg-gray-50 overflow-hidden thinking-block-scanline",
        className
      )}
    >
      {/* 折叠态头部 - 约 36-40px 高度 */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {/* 左侧状态图标 - 简单Loading */}
          {isThinking && !isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#10A37F]" strokeWidth={2} />
          ) : (
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500">
              <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
            </div>
          )}
          
          {/* 状态文本 */}
          <span className="text-sm text-gray-600">
            {getStatusText()}
          </span>
          
          {/* 耗时（可选） */}
          {elapsedTime && isThinking && (
            <span className="text-xs text-gray-400 ml-1">
              {elapsedTime}
            </span>
          )}
        </div>
        
        {/* 右侧展开/折叠图标 */}
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </motion.div>
      </button>

      {/* 展开态详情 - 极简列表（无卡片，无阴影） */}
      <AnimatePresence initial={false}>
        {isExpanded && nodes.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {/* 🔥 极简列表：无边框，无背景，只有文字 */}
            <ul className="px-3 pb-2.5 pt-1 space-y-0.5">
              {nodes.map((node, index) => (
                <ThoughtItem
                  key={node.id}
                  label={node.config.label}
                  status={node.status}
                  icon={node.config.icon}
                  index={index}
                />
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default ThoughtDrawer
