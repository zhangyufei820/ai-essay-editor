/**
 * 🎯 作文批改智能体 - 工作流可视化组件 (备份)
 * 
 * 高保真沉浸式状态可视化系统
 * 将 AI 的"思考与批改路径"透明化展示
 * 
 * 设计原则：
 * - 严格使用项目现有 CSS 变量配色方案
 * - 流畅的 Framer Motion 动画
 * - 专业的教学领域术语
 * - 禁止泄露底层模型名称
 */

"use client"

import { memo, useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, Check, Loader2, AlertCircle, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  WorkflowState,
  WorkflowNodeState,
  WorkflowNodeStatus,
  getRandomFakeLog
} from "@/lib/workflow-visual-config"

// ============================================
// 类型定义
// ============================================

interface WorkflowVisualizerProps {
  workflowState: WorkflowState
  isProcessing: boolean
  onToggleExpanded: () => void
  summaryText: string
  className?: string
}

interface StepCardProps {
  node: WorkflowNodeState
  index: number
  isLast: boolean
}

// ============================================
// 动画配置
// ============================================

const containerVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: { 
    opacity: 1, 
    height: "auto",
    transition: {
      height: { duration: 0.3, ease: "easeOut" },
      opacity: { duration: 0.2 },
      staggerChildren: 0.1
    }
  },
  exit: { 
    opacity: 0, 
    height: 0,
    transition: { duration: 0.2 }
  }
}

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.3, ease: "easeOut" as const }
  }
}

// ============================================
// 状态图标组件
// ============================================

const StatusIcon = memo(function StatusIcon({ 
  status 
}: { 
  status: WorkflowNodeStatus 
}) {
  switch (status) {
    case "completed":
      return (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
          className="flex items-center justify-center w-5 h-5 rounded-full bg-primary"
        >
          <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
        </motion.div>
      )
    case "running":
      return (
        <motion.div
          animate={{ 
            boxShadow: [
              "0 0 0 0 var(--color-primary-200)",
              "0 0 0 8px transparent"
            ]
          }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10"
        >
          <Loader2 className="w-3 h-3 animate-spin text-primary" />
        </motion.div>
      )
    case "error":
      return (
        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-destructive/10">
          <AlertCircle className="w-3 h-3 text-destructive" />
        </div>
      )
    default: // pending
      return (
        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
      )
  }
})

// ============================================
// 步骤卡片组件
// ============================================

const StepCard = memo(function StepCard({ 
  node, 
  index,
  isLast 
}: StepCardProps) {
  const { config, status, currentTextIndex } = node
  const Icon = config.icon
  const isRunning = status === "running"
  const isCompleted = status === "completed"
  const isHighlight = config.isHighlight
  
  // 获取当前显示的运行文案
  const currentText = config.runningTexts[currentTextIndex] || config.runningTexts[0]
  
  // 伪日志状态
  const [fakeLog, setFakeLog] = useState("")
  
  useEffect(() => {
    if (isRunning) {
      const updateFakeLog = () => {
        setFakeLog(getRandomFakeLog(config.group))
      }
      updateFakeLog()
      const timer = setInterval(updateFakeLog, 3000)
      return () => clearInterval(timer)
    }
  }, [isRunning, config.group])

  return (
    <motion.div
      variants={itemVariants}
      className="relative"
    >
      {/* 连接线 */}
      {!isLast && (
        <div 
          className={cn(
            "absolute left-[9px] top-[28px] w-0.5 h-[calc(100%-8px)]",
            isCompleted ? "bg-primary" : "bg-border"
          )}
        />
      )}
      
      <div className="flex gap-3">
        {/* 状态图标 */}
        <div className="flex-shrink-0 pt-1">
          <StatusIcon status={status} />
        </div>
        
        {/* 卡片内容 */}
        <motion.div
          className={cn(
            "flex-1 rounded-xl p-4 mb-3 transition-all duration-200 border",
            isRunning && "ring-2 ring-primary/20 border-primary bg-primary/5",
            isCompleted && "bg-muted/50 border-border",
            !isRunning && !isCompleted && "bg-card border-border"
          )}
          animate={isRunning ? {
            boxShadow: [
              "0 0 0 0 var(--color-primary-100)",
              "0 0 20px 4px var(--color-primary-100)",
              "0 0 0 0 var(--color-primary-100)"
            ]
          } : {}}
          transition={isRunning ? { duration: 2, repeat: Infinity } : {}}
        >
          {/* 头部：图标 + 标题 */}
          <div className="flex items-start gap-3">
            <div 
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0",
                isHighlight ? "bg-primary" : "bg-primary/10"
              )}
            >
              <Icon 
                className={cn(
                  "w-4 h-4",
                  isHighlight ? "text-primary-foreground" : "text-primary"
                )}
              />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium truncate text-foreground">
                  {config.displayName}
                </h4>
                {isHighlight && (
                  <Sparkles className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
                )}
              </div>
              <p className="text-xs mt-0.5 truncate text-muted-foreground">
                {config.englishName}
              </p>
            </div>
          </div>
          
          {/* 运行中状态：显示微交互文案 */}
          <AnimatePresence mode="wait">
            {isRunning && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 pt-3 border-t border-primary/20"
              >
                {/* 主文案 */}
                <motion.p
                  key={currentText}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="text-xs font-medium text-primary"
                >
                  {currentText}
                </motion.p>
                
                {/* 伪日志 */}
                {fakeLog && (
                  <motion.p
                    key={fakeLog}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.6 }}
                    className="text-[10px] mt-1.5 font-mono text-muted-foreground"
                  >
                    → {fakeLog}
                  </motion.p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  )
})

// ============================================
// 主组件：工作流可视化器
// ============================================

export function WorkflowVisualizer({
  workflowState,
  isProcessing,
  onToggleExpanded,
  summaryText,
  className
}: WorkflowVisualizerProps) {
  const { nodes, isExpanded } = workflowState
  
  // 如果没有节点，不显示
  if (nodes.length === 0 && !isProcessing) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl overflow-hidden bg-muted/50 border border-border",
        className
      )}
    >
      {/* 折叠态头部 */}
      <button
        onClick={onToggleExpanded}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/80 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isProcessing && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <Sparkles className="w-4 h-4 text-primary" />
            </motion.div>
          )}
          <span className="text-sm text-muted-foreground">
            {summaryText}
          </span>
        </div>
        
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>
      
      {/* 展开态内容 */}
      <AnimatePresence>
        {isExpanded && nodes.length > 0 && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="px-4 pb-4"
          >
            <div className="pt-3 border-t border-border">
              {nodes.map((node, index) => (
                <StepCard
                  key={node.id}
                  node={node}
                  index={index}
                  isLast={index === nodes.length - 1}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default WorkflowVisualizer
