/**
 * 🎯 Dify Workflow 可视化配置
 * 
 * GenSpark 1:1 像素级复刻版本
 * 
 * 支持的智能体：
 * - 作文批改智能体
 * - 教学评助手智能体
 * 
 * 🔥 关键设计：
 * - "总编辑"节点触发 HANDOVER：结束思考，折叠抽屉，开始打字
 * - "快速回复"/"极速回复"节点触发 FAST_TRACK：完全跳过思考UI，直接打字
 * - 思考抽屉采用极简折叠样式，高度约 36-40px
 * - 并行节点支持：多个节点可同时显示为 running 状态，营造"多核并发"视觉效果
 */

import { 
  Scan, Eye, Filter, FileText, Layers, Cpu, Brain, Sparkles, CheckCircle, Link,
  GitBranch, FileSearch, Database, Scale, BookOpen, UserCheck, Layout,
  type LucideIcon 
} from "lucide-react"

// ============================================
// 类型定义
// ============================================

export type WorkflowNodeStatus = "pending" | "preparing" | "running" | "completed" | "error"

/** 
 * 节点触发类型
 * - thinking: 显示在思考抽屉中的步骤
 * - HANDOVER: 触发交接（结束思考，开始生成）
 * - FAST_TRACK: 快速通道（跳过思考UI，直接打字）
 * - hidden: 完全隐藏，不触发任何逻辑
 */
export type TriggerType = "thinking" | "HANDOVER" | "FAST_TRACK" | "hidden"

export interface WorkflowNodeConfig {
  /** UI 显示的名称 */
  label: string
  /** 图标名称 */
  icon: LucideIcon
  /** 触发类型 */
  triggerType: TriggerType
  /** 是否隐藏（不显示在思考列表中） */
  hidden?: boolean
  /** 运行中的微交互文案数组（轮播显示） */
  runningTexts?: string[]
  /** 预估耗时（秒） */
  estimatedDuration?: number
}

export interface WorkflowState {
  nodes: WorkflowNodeState[]
  currentNodeIndex: number
  isExpanded: boolean
  startTime?: number
  /** 是否处于思考阶段 */
  isThinking: boolean
  /** 是否已触发生成阶段 */
  isGenerating: boolean
  /** 是否为快速通道模式（跳过思考UI） */
  isFastTrack: boolean
}

export interface WorkflowNodeState {
  id: string
  originalName: string
  config: WorkflowNodeConfig
  status: WorkflowNodeStatus
  startTime?: number
  endTime?: number
  currentTextIndex: number
}

// ============================================
// 🔥 节点可视化配置表 (NODE_VISUAL_MAP)
// ============================================

export const NODE_VISUAL_MAP: Record<string, WorkflowNodeConfig> = {
  // --- 可视化思考节点 (显示在抽屉里) ---
  '格式判断': { 
    label: '多模态意图识别', 
    icon: Scan,
    triggerType: 'thinking',
    runningTexts: [
      '正在扫描文件元数据...',
      '识别作业类型中...',
      '分析输入格式...'
    ],
    estimatedDuration: 2
  },
  '视觉提取': { 
    label: '手写体结构化识别', 
    icon: Eye,
    triggerType: 'thinking',
    runningTexts: [
      '正在提取笔迹特征...',
      '正在进行文字转录...',
      '识别手写字符中...'
    ],
    estimatedDuration: 5
  },
  '数据清洗': { 
    label: 'OCR噪声过滤', 
    icon: Filter,
    triggerType: 'thinking',
    runningTexts: [
      '正在校准文本行...',
      '过滤识别噪声...',
      '对齐段落结构...'
    ],
    estimatedDuration: 3
  },
  '文档提取器': { 
    label: '非结构化资源解析', 
    icon: FileText,
    triggerType: 'thinking',
    runningTexts: [
      '解析文档结构...',
      '提取文本内容...',
      '识别格式元素...'
    ],
    estimatedDuration: 3
  },
  '内容汇聚': { 
    label: '上下文向量聚合', 
    icon: Link,
    triggerType: 'thinking',
    runningTexts: [
      '聚合上下文信息...',
      '构建语义向量...',
      '整合内容片段...'
    ],
    estimatedDuration: 2
  },
  '代码执行 4': { 
    label: '语法逻辑校验', 
    icon: Cpu,
    triggerType: 'thinking',
    runningTexts: [
      '正在验证语言学规则...',
      '检查语法结构...',
      '分析逻辑连贯性...'
    ],
    estimatedDuration: 4
  },

  // ============================================
  // 🎓 教学评助手 - 节点映射配置
  // ============================================

  // --- A. 路由与解析层 (Routing & Parsing) ---
  '问题分类器': {
    label: '教学意图动态路由',
    icon: GitBranch,
    triggerType: 'thinking',
    runningTexts: [
      '正在分析查询意图...',
      '识别教学场景类型...',
      '匹配最优处理路径...'
    ],
    estimatedDuration: 2
  },
  
  // ============================================
  // 🎨 Banana 2 Pro 4K - 图像生成节点映射
  // ============================================
  
  // 🔥 Banana 使用快速通道，不显示思考过程
  // 首轮对话会显示 SimpleBrainLoader（"思考中..."）
  // 后续直接显示生成结果，不显示工作流节点
  
  // --- B. 核心检索层 (Retrieval Layer) ---
  '知识检索': {
    label: '语义知识库深度检索',
    icon: Database,
    triggerType: 'thinking',
    runningTexts: [
      '正在召回高置信度上下文...',
      '检索教学知识图谱...',
      '匹配相关教学案例...'
    ],
    estimatedDuration: 3
  },

  // --- C. 并行分析层 (Parallel Analysis Layer) ---
  // 🔥 这三个节点在工作流中是并行发生的，营造"多核并发"视觉冲击
  '一致性分析': {
    label: '课程大纲一致性校验',
    icon: Scale,
    triggerType: 'thinking',
    runningTexts: [
      '正在比对课程标准...',
      '校验教学目标对齐度...',
      '分析知识点覆盖率...'
    ],
    estimatedDuration: 4
  },
  '教案分析': {
    label: '教学结构解构分析',
    icon: BookOpen,
    triggerType: 'thinking',
    runningTexts: [
      '正在解构教学设计...',
      '分析教学环节逻辑...',
      '评估教学策略有效性...'
    ],
    estimatedDuration: 4
  },
  '学生表现': {
    label: '学习行为模式识别',
    icon: UserCheck,
    triggerType: 'thinking',
    runningTexts: [
      '正在识别学习行为模式...',
      '分析学生参与度指标...',
      '评估学习效果特征...'
    ],
    estimatedDuration: 4
  },

  // --- D. 合成与输出层 (Synthesis & Output) ---
  '模板转换': {
    label: '结构化输出标准化',
    icon: Layout,
    triggerType: 'thinking',
    runningTexts: [
      '正在标准化输出格式...',
      '构建结构化报告...',
      '优化呈现逻辑...'
    ],
    estimatedDuration: 2
  },

  // --- 隐形触发节点 (不显示，仅用于触发逻辑) ---
  '总编辑': { 
    label: '总编辑',
    icon: Brain,
    triggerType: 'HANDOVER',
    hidden: true 
  },
  '快速回复': { 
    label: '快速回复',
    icon: Sparkles,
    triggerType: 'FAST_TRACK',
    hidden: true 
  },
  // 🎓 教学评助手 - 快速通道
  '极速回复': { 
    label: '极速回复',
    icon: Sparkles,
    triggerType: 'FAST_TRACK',
    hidden: true 
  },
  '直接回复': {
    label: '直接回复',
    icon: Sparkles,
    triggerType: 'HANDOVER',
    hidden: true
  },
  
  // --- 忽略节点 ---
  '用户输入': { 
    label: '用户输入',
    icon: Scan,
    triggerType: 'hidden',
    hidden: true 
  },
  '条件分支 2': { 
    label: '条件分支',
    icon: Scan,
    triggerType: 'hidden',
    hidden: true 
  },
  '直接回复 6': { 
    label: '直接回复',
    icon: Scan,
    triggerType: 'hidden',
    hidden: true 
  },
  '开始': {
    label: '开始',
    icon: Scan,
    triggerType: 'hidden',
    hidden: true
  },
  '结束': {
    label: '结束',
    icon: Scan,
    triggerType: 'hidden',
    hidden: true
  }
}

// ============================================
// 辅助函数
// ============================================

/**
 * 根据 Dify 原始节点名称获取可视化配置
 */
export function getNodeConfig(originalName: string): WorkflowNodeConfig | null {
  return NODE_VISUAL_MAP[originalName] || null
}

/**
 * 检查节点是否应该被隐藏
 */
export function shouldHideNode(originalName: string): boolean {
  const config = NODE_VISUAL_MAP[originalName]
  return config?.hidden === true || config?.triggerType === 'hidden'
}

/**
 * 检查是否为 HANDOVER 触发节点（结束思考，开始生成）
 */
export function isHandoverNode(originalName: string): boolean {
  const config = NODE_VISUAL_MAP[originalName]
  return config?.triggerType === 'HANDOVER'
}

/**
 * 检查是否为 FAST_TRACK 触发节点（跳过思考UI）
 */
export function isFastTrackNode(originalName: string): boolean {
  const config = NODE_VISUAL_MAP[originalName]
  return config?.triggerType === 'FAST_TRACK'
}

/**
 * 检查是否为思考节点（显示在抽屉中）
 */
export function isThinkingNode(originalName: string): boolean {
  const config = NODE_VISUAL_MAP[originalName]
  return config?.triggerType === 'thinking' && !config?.hidden
}

/**
 * 获取节点的下一个运行文案（轮播）
 */
export function getNextRunningText(config: WorkflowNodeConfig, currentIndex: number): {
  text: string
  nextIndex: number
} {
  const texts = config.runningTexts || ['处理中...']
  const nextIndex = (currentIndex + 1) % texts.length
  return {
    text: texts[currentIndex % texts.length],
    nextIndex
  }
}

/**
 * 创建初始工作流状态
 */
export function createInitialWorkflowState(): WorkflowState {
  return {
    nodes: [],
    currentNodeIndex: -1,
    isExpanded: false, // 默认折叠
    isThinking: false,
    isGenerating: false,
    isFastTrack: false
  }
}

/**
 * 根据节点名称创建节点状态
 */
export function createNodeState(originalName: string): WorkflowNodeState | null {
  const config = getNodeConfig(originalName)
  if (!config || config.hidden || config.triggerType !== 'thinking') return null
  
  return {
    id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    originalName,
    config,
    status: "pending",
    currentTextIndex: 0
  }
}

/**
 * 计算已完成节点数量
 */
export function getCompletedCount(nodes: WorkflowNodeState[]): number {
  return nodes.filter(n => n.status === "completed").length
}

/**
 * 获取当前运行中的节点（返回第一个）
 */
export function getCurrentRunningNode(nodes: WorkflowNodeState[]): WorkflowNodeState | null {
  return nodes.find(n => n.status === "running") || null
}

/**
 * 获取所有运行中的节点（支持并行节点）
 */
export function getAllRunningNodes(nodes: WorkflowNodeState[]): WorkflowNodeState[] {
  return nodes.filter(n => n.status === "running")
}

/**
 * 获取折叠态摘要文本（支持并行节点）
 */
export function getCollapsedSummary(
  nodes: WorkflowNodeState[],
  isThinking: boolean,
  isGenerating: boolean
): string {
  const completedCount = getCompletedCount(nodes)
  const runningNodes = getAllRunningNodes(nodes)
  
  if (isGenerating) {
    return '已完成深度分析'
  }
  
  // 🔥 并行节点支持：显示多个正在运行的节点
  if (runningNodes.length > 1) {
    return `正在并行处理 ${runningNodes.length} 个分析任务...`
  }
  
  if (runningNodes.length === 1) {
    const runningNode = runningNodes[0]
    return runningNode.config.runningTexts?.[0] || `正在${runningNode.config.label}...`
  }
  
  if (isThinking && completedCount === 0) {
    return '正在解析文档结构...'
  }
  
  if (completedCount > 0) {
    return `已完成 ${completedCount} 个分析步骤`
  }
  
  return '准备分析中...'
}

// ============================================
// 动画配置
// ============================================

export const ANIMATION_CONFIG = {
  /** 文案轮播间隔（毫秒） */
  textRotationInterval: 2000,
  /** 进度条动画时长（毫秒） */
  progressBarDuration: 500,
  /** 节点切换动画时长（毫秒） */
  nodeTransitionDuration: 300,
  /** 思考容器折叠动画时长（毫秒） */
  drawerCollapseDelay: 200,
  /** 光标闪烁周期（毫秒） */
  cursorBlinkDuration: 1000
}
