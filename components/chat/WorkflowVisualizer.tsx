/**
 * 🎯 GenSpark 1:1 复刻 - 工作流可视化组件
 * 
 * 这是一个包装组件，直接使用 ThoughtDrawer 实现 GenSpark 风格的思考抽屉
 * 
 * 设计规范：
 * - 使用 ThoughtDrawer 组件实现极简折叠抽屉
 * - 快速通道模式下不显示任何思考UI
 * - 配色沿用 Emerald Green (#10b981) 体系
 */

"use client"

import React from "react"
import { ThoughtDrawer } from "./ThoughtDrawer"
import { WorkflowState } from "@/lib/workflow-visual-config"

// ============================================
// 类型定义
// ============================================

interface WorkflowVisualizerProps {
  workflowState: WorkflowState
  isThinking: boolean
  isGenerating: boolean
  onToggle: () => void
  currentFakeLog?: string
  currentRunningText?: string
  className?: string
}

// ============================================
// 主组件
// ============================================

export const WorkflowVisualizer: React.FC<WorkflowVisualizerProps> = ({
  workflowState,
  isThinking,
  isGenerating,
  onToggle,
  currentRunningText,
  className
}) => {
  // 🔥 快速通道模式：完全不显示思考UI
  if (workflowState.isFastTrack) {
    return null
  }

  // 🔥 无节点且不在思考/生成中：不显示
  if (!isThinking && !isGenerating && workflowState.nodes.length === 0) {
    return null
  }

  return (
    <ThoughtDrawer
      workflowState={workflowState}
      isThinking={isThinking}
      isGenerating={isGenerating}
      onToggle={onToggle}
      currentRunningText={currentRunningText}
      className={className}
    />
  )
}

export default WorkflowVisualizer
