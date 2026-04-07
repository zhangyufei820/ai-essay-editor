/**
 * 🎯 GenSpark 1:1 复刻 - 工作流可视化 Hook
 * 
 * 解析 Dify SSE 事件流，管理工作流状态机
 * 
 * 🔥 关键设计：
 * - HANDOVER 逻辑：检测到"总编辑"节点时，强制结束思考，折叠抽屉，开始打字
 * - FAST_TRACK 逻辑：检测到"快速回复"节点时，完全跳过思考UI，直接打字
 * - 状态同步：确保"上面还在转，下面已经出字"的幽灵状态绝不出现
 */

import { useState, useCallback, useRef, useEffect } from "react"
import {
  WorkflowState,
  WorkflowNodeState,
  WorkflowNodeStatus,
  WorkflowNodeConfig,
  shouldHideNode,
  getCompletedCount,
  getCurrentRunningNode,
  getNextRunningText,
  getNodeConfig,
  isHandoverNode,
  isFastTrackNode,
  isThinkingNode,
  getCollapsedSummary,
  createInitialWorkflowState,
  ANIMATION_CONFIG
} from "@/lib/workflow-visual-config"

// ============================================
// 类型定义
// ============================================

export interface UseWorkflowVisualizerReturn {
  /** 工作流状态 */
  workflowState: WorkflowState
  /** 是否正在处理工作流 */
  isProcessing: boolean
  /** 是否处于思考阶段 */
  isThinking: boolean
  /** 是否已进入生成阶段 */
  isGenerating: boolean
  /** 是否为快速通道模式 */
  isFastTrack: boolean
  /** 是否应该显示光标 */
  showCursor: boolean
  /** 处理 SSE 事件 */
  handleSSEEvent: (event: DifySSEEvent) => void
  /** 重置工作流状态 */
  resetWorkflow: () => void
  /** 切换展开/折叠 */
  toggleExpanded: () => void
  /** 获取折叠态摘要文本 */
  getSummaryText: () => string
  /** 手动标记工作流完成 */
  markWorkflowComplete: () => void
  /** 当前运行节点的文案 */
  currentRunningText: string
  /** 触发"交接"：结束思考，开始生成 */
  triggerHandover: () => void
  /** 触发"快速通道"：跳过思考UI */
  triggerFastTrack: () => void
}

export interface DifySSEEvent {
  event: string
  data?: {
    node_id?: string
    title?: string
    status?: string
    workflow_run_id?: string
    text?: string
    outputs?: {
      text?: string
      result?: string
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  conversation_id?: string
  answer?: string
  text?: string
}

// ============================================
// Hook 实现
// ============================================

export function useWorkflowVisualizer(): UseWorkflowVisualizerReturn {
  const [workflowState, setWorkflowState] = useState<WorkflowState>(createInitialWorkflowState())
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentRunningText, setCurrentRunningText] = useState("")
  const [showCursor, setShowCursor] = useState(false)
  
  // 用于防止重复添加节点
  const processedNodesRef = useRef<Set<string>>(new Set())
  // 文案轮播定时器
  const textRotationTimerRef = useRef<NodeJS.Timeout | null>(null)
  // 是否已触发交接
  const hasTriggeredHandoverRef = useRef(false)
  // 是否已触发快速通道
  const hasTriggeredFastTrackRef = useRef(false)

  // 清理所有定时器
  const clearAllTimers = useCallback(() => {
    if (textRotationTimerRef.current) {
      clearInterval(textRotationTimerRef.current)
      textRotationTimerRef.current = null
    }
  }, [])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      clearAllTimers()
    }
  }, [clearAllTimers])

  // 启动文案轮播
  const startTextRotation = useCallback((node: WorkflowNodeState) => {
    if (textRotationTimerRef.current) {
      clearInterval(textRotationTimerRef.current)
    }
    
    // 立即显示第一条
    const firstText = node.config.runningTexts?.[0] || `正在${node.config.label}...`
    setCurrentRunningText(firstText)
    
    textRotationTimerRef.current = setInterval(() => {
      setWorkflowState(prev => {
        // 如果已进入生成阶段或快速通道，停止轮播
        if (prev.isGenerating || prev.isFastTrack) return prev
        
        const runningNode = prev.nodes.find(n => n.status === "running")
        if (!runningNode) return prev
        
        const { text, nextIndex } = getNextRunningText(runningNode.config, runningNode.currentTextIndex)
        setCurrentRunningText(text)
        
        return {
          ...prev,
          nodes: prev.nodes.map(n => 
            n.id === runningNode.id 
              ? { ...n, currentTextIndex: nextIndex }
              : n
          )
        }
      })
    }, ANIMATION_CONFIG.textRotationInterval)
  }, [])

  // 停止所有轮播
  const stopAllRotations = useCallback(() => {
    clearAllTimers()
    setCurrentRunningText("")
  }, [clearAllTimers])

  // 🔥 触发"交接"：结束思考，开始生成
  const triggerHandover = useCallback(() => {
    if (hasTriggeredHandoverRef.current) return
    hasTriggeredHandoverRef.current = true
    
    console.log("🔥 [HANDOVER] 触发交接：结束思考，折叠抽屉，开始打字")
    
    // 停止所有轮播动画
    stopAllRotations()
    
    // 激活光标
    setShowCursor(true)
    
    // 更新状态：
    // A. 将所有未完成的步骤强制标记为 completed
    // B. 设置 isThinking = false
    // C. 自动折叠思考面板 (isExpanded = false)
    // D. 设置 isGenerating = true
    setWorkflowState(prev => ({
      ...prev,
      nodes: prev.nodes.map(node => ({
        ...node,
        status: "completed" as WorkflowNodeStatus,
        endTime: node.endTime || Date.now()
      })),
      isExpanded: false,
      isThinking: false,
      isGenerating: true,
      isFastTrack: false
    }))
  }, [stopAllRotations])

  // 🔥 触发"快速通道"：跳过思考UI，直接打字
  const triggerFastTrack = useCallback(() => {
    if (hasTriggeredFastTrackRef.current) return
    hasTriggeredFastTrackRef.current = true
    
    console.log("⚡ [FAST_TRACK] 触发快速通道：跳过思考UI，直接打字")
    
    // 停止所有轮播动画
    stopAllRotations()
    
    // 激活光标
    setShowCursor(true)
    
    // 更新状态：完全跳过思考UI
    setWorkflowState(prev => ({
      ...prev,
      nodes: [], // 清空节点，不显示思考抽屉
      isExpanded: false,
      isThinking: false,
      isGenerating: true,
      isFastTrack: true
    }))
  }, [stopAllRotations])

  // 处理 SSE 事件
  const handleSSEEvent = useCallback((event: DifySSEEvent) => {
    const { event: eventType, data } = event
    
    // 🔍 调试：打印所有事件
    console.log(`📡 [SSE] 事件类型: ${eventType}`, data)

    // 工作流开始
    if (eventType === "workflow_started") {
      console.log("🚀 [Workflow] 工作流开始")
      setIsProcessing(true)
      processedNodesRef.current.clear()
      hasTriggeredHandoverRef.current = false
      hasTriggeredFastTrackRef.current = false
      setShowCursor(false)
      
      setWorkflowState({
        nodes: [],
        currentNodeIndex: -1,
        isExpanded: false, // 默认折叠
        startTime: Date.now(),
        isThinking: true,
        isGenerating: false,
        isFastTrack: false
      })
      
      return
    }

    // 工作流结束
    if (eventType === "workflow_finished") {
      console.log("✅ [Workflow] 工作流结束")
      setIsProcessing(false)
      stopAllRotations()
      
      // 将所有节点标记为完成
      setWorkflowState(prev => ({
        ...prev,
        nodes: prev.nodes.map(node => ({
          ...node,
          status: "completed" as WorkflowNodeStatus,
          endTime: node.endTime || Date.now()
        })),
        isThinking: false
      }))
      return
    }

    // 节点开始
    if (eventType === "node_started" && data?.title) {
      const nodeTitle = data.title
      const config = getNodeConfig(nodeTitle)
      const isThinking = isThinkingNode(nodeTitle)
      const isHandover = isHandoverNode(nodeTitle)
      const isFastTrackFlag = isFastTrackNode(nodeTitle)
      
      console.log(`📍 [Node Started] "${nodeTitle}"`)
      console.log(`   ├─ 配置存在: ${config ? '✅' : '❌'}`)
      console.log(`   ├─ 思考节点: ${isThinking ? '✅' : '❌'}`)
      console.log(`   ├─ 交接节点: ${isHandover ? '✅' : '❌'}`)
      console.log(`   └─ 已触发交接: ${hasTriggeredHandoverRef.current ? '✅' : '❌'}`)
      
      // 🔥 【关键】检测到"快速回复"节点，触发快速通道
      if (isFastTrackFlag) {
        console.log(`⚡ [FAST_TRACK] 检测到快速通道节点: ${nodeTitle}`)
        triggerFastTrack()
        return
      }
      
      // 🔥 【关键】检测到"总编辑"或"直接回复"节点，触发交接
      if (isHandover) {
        console.log(`🔥 [HANDOVER] 检测到交接节点: ${nodeTitle}，触发 handover`)
        triggerHandover()
        return
      }
      
      // 检查是否应该隐藏
      if (shouldHideNode(nodeTitle)) {
        console.log(`🙈 [Hidden] 隐藏节点: ${nodeTitle}`)
        return
      }
      
      // 如果已进入生成阶段或快速通道，忽略后续思考节点
      if (hasTriggeredHandoverRef.current || hasTriggeredFastTrackRef.current) {
        console.log(`⏭️ [Skip] 已进入生成阶段，跳过: ${nodeTitle}`)
        return
      }
      
      // 检查是否为思考节点
      if (!isThinking) {
        console.log(`⏭️ [Skip] 非思考节点（配置不匹配）: ${nodeTitle}`)
        return
      }
      
      // 防止重复添加
      const nodeKey = `${nodeTitle}-${data.node_id || ''}`
      if (processedNodesRef.current.has(nodeKey)) {
        console.log(`⏭️ [Duplicate] 重复节点: ${nodeTitle}`)
        return
      }
      processedNodesRef.current.add(nodeKey)
      
      // 获取节点配置（config 已在上面声明）
      if (!config) {
        console.log(`⚠️ [Unknown] 未知节点: ${nodeTitle}`)
        return
      }
      
      // 创建新节点
      const newNode: WorkflowNodeState = {
        id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        originalName: nodeTitle,
        config,
        status: "running",
        startTime: Date.now(),
        currentTextIndex: 0
      }
      
      console.log(`✨ [Add Node] 添加思考节点: ${config.label}`)
      
      setWorkflowState(prev => {
        // 🔥 并行节点支持：不再将之前运行的节点标记为完成
        // 允许多个节点同时处于 running 状态，营造"多核并发"视觉效果
        // 节点只有在收到 node_finished 事件时才会被标记为完成
        return {
          ...prev,
          nodes: [...prev.nodes, newNode],
          currentNodeIndex: prev.nodes.length,
          isThinking: true
        }
      })
      
      // 启动文案轮播
      startTextRotation(newNode)
      
      return
    }

    // 节点完成
    if (eventType === "node_finished" && data?.title) {
      const nodeTitle = data.title
      console.log(`✅ [Node Finished] ${nodeTitle}`)
      
      // 标记节点完成
      setWorkflowState(prev => ({
        ...prev,
        nodes: prev.nodes.map(node => 
          node.originalName === nodeTitle
            ? { ...node, status: "completed" as WorkflowNodeStatus, endTime: Date.now() }
            : node
        )
      }))
      
      return
    }

    // 处理错误
    if (eventType === "error") {
      console.error("❌ [Error] 工作流错误")
      setIsProcessing(false)
      stopAllRotations()
      setWorkflowState(prev => ({
        ...prev,
        nodes: prev.nodes.map(node => ({
          ...node,
          status: node.status === "running" || node.status === "preparing" 
            ? "error" as WorkflowNodeStatus 
            : node.status
        })),
        isThinking: false,
        isGenerating: false
      }))
      return
    }
  }, [startTextRotation, stopAllRotations, triggerHandover, triggerFastTrack])

  // 重置工作流
  const resetWorkflow = useCallback(() => {
    console.log("🔄 [Reset] 重置工作流状态")
    setIsProcessing(false)
    stopAllRotations()
    processedNodesRef.current.clear()
    hasTriggeredHandoverRef.current = false
    hasTriggeredFastTrackRef.current = false
    setShowCursor(false)
    setWorkflowState(createInitialWorkflowState())
  }, [stopAllRotations])

  // 切换展开/折叠
  const toggleExpanded = useCallback(() => {
    setWorkflowState(prev => ({
      ...prev,
      isExpanded: !prev.isExpanded
    }))
  }, [])

  // 获取折叠态摘要文本
  const getSummaryText = useCallback((): string => {
    const { nodes, isThinking, isGenerating } = workflowState
    return getCollapsedSummary(nodes, isThinking, isGenerating)
  }, [workflowState])

  // 手动标记工作流完成
  const markWorkflowComplete = useCallback(() => {
    console.log("✅ [Complete] 手动标记工作流完成")
    setIsProcessing(false)
    stopAllRotations()
    
    setWorkflowState(prev => ({
      ...prev,
      nodes: prev.nodes.map(node => ({
        ...node,
        status: "completed" as WorkflowNodeStatus,
        endTime: node.endTime || Date.now()
      })),
      isThinking: false,
      isGenerating: false
    }))
  }, [stopAllRotations])

  return {
    workflowState,
    isProcessing,
    isThinking: workflowState.isThinking,
    isGenerating: workflowState.isGenerating,
    isFastTrack: workflowState.isFastTrack,
    showCursor,
    handleSSEEvent,
    resetWorkflow,
    toggleExpanded,
    getSummaryText,
    markWorkflowComplete,
    currentRunningText,
    triggerHandover,
    triggerFastTrack
  }
}

export default useWorkflowVisualizer
