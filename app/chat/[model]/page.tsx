"use client"

import dynamic from 'next/dynamic'
import { useParams, notFound } from 'next/navigation'
import { LoadingStateV2 } from '@/components/ui/v2'
import { PLAZA_AGENTS } from '@/components/agents/agent-plaza-data'
import type { ModelType } from '@/lib/pricing'

// 🎯 支持的模型/智能体列表
// 新增智能体时，只需在此处添加即可
const BUILTIN_CHAT_MODELS = [
  'standard',        // 作文批改
  'general-chat',    // 通用轻量对话
  'teaching-pro',    // 教学评助手
  'gpt-5',           // ChatGPT 5.5
  'claude-opus',     // Claude opus4.6thinking
  'gemini-pro',      // Gemini 3.1 pro
  'gemini-image',    // Gemini 图像
  'gpt-image-2',     // GPT Image 2
  'grok-4.2',        // Grok-4.2
  'open-claw',       // Open Claw
  'quanquan-math',   // 全圈数学智能体
  'quanquan-english', // 全圈英语智能体
  'vocab-card',      // 词境记忆卡
  'problem',         // 题目解析
  'beike-pro',       // 备课助手Pro
  'banzhuren',       // 班主任智能体
  'all-in-one-agent', // 数学图片与动画生成器
  'super-all-in-one-agent', // 超级全能智能体
  'ai-writing-paper', // 论文写作
  'zhongying-essay', // 中英文作文
  'experiment-report',// 实验报告
] as const

const SUPPORTED_MODELS = [
  ...BUILTIN_CHAT_MODELS,
  ...PLAZA_AGENTS.filter((agent) => agent.href.startsWith("/chat/") && !agent.workflowSkill).map((agent) => agent.id),
] as const

export type SupportedModel = typeof SUPPORTED_MODELS[number]

// 🔥 动态导入通用聊天界面
const EnhancedChatInterface = dynamic(
  () => import("@/components/chat/enhanced-chat-interface").then(mod => ({ default: mod.EnhancedChatInterface })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-[var(--paper-50)]">
        <LoadingStateV2 label="AI 正在思考..." size="md" />
      </div>
    )
  }
)

// Gemini 图像使用与 GPT Image 2 一致的图像工作台界面
const GeminiImageWorkspace = dynamic(
  () => import("@/components/chat/gpt-image2-chat-interface").then(mod => {
    const ImageWorkspace = mod.GptImage2ChatInterface
    return {
      default: function GeminiWorkspace() {
        return <ImageWorkspace workspaceModel="gemini-image" />
      },
    }
  }),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-[var(--paper-50)]">
        <LoadingStateV2 label="图像工作台加载中..." size="md" />
      </div>
    )
  }
)

const ImageWorkspace = dynamic(
  () => import("@/components/chat/gpt-image2-chat-interface").then(mod => ({ default: mod.GptImage2ChatInterface })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-[var(--paper-50)]">
        <LoadingStateV2 label="图像工作台加载中..." size="md" />
      </div>
    )
  }
)

export default function ModelChatPage() {
  const params = useParams()
  const model = params.model as string

  // 🔍 调试日志
  console.log('🔍 [ModelChatPage] 当前模型:', model)
  console.log('🔍 [ModelChatPage] 是否为 gemini-image:', model === 'gemini-image')

  // 验证模型是否支持
  if (!SUPPORTED_MODELS.includes(model as SupportedModel)) {
    notFound()
  }

  const supportedModel = model as ModelType

  // 🔥 根据模型选择不同的界面组件
  if (supportedModel === 'gemini-image') {
    console.log('✅ [ModelChatPage] 使用 Gemini 图像工作台')
    return (
      <main className="flex min-h-screen flex-col">
        <div className="flex-1">
          <GeminiImageWorkspace />
        </div>
      </main>
    )
  }

  if (supportedModel === 'gpt-image-2') {
    console.log('✅ [ModelChatPage] 使用图像工作台')
    return (
      <main className="flex min-h-screen flex-col">
        <div className="flex-1">
          <ImageWorkspace workspaceModel="gpt-image-2" />
        </div>
      </main>
    )
  }

  // 其他模型使用通用界面
  console.log('⚠️ [ModelChatPage] 使用 EnhancedChatInterface，模型:', supportedModel)
  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex-1">
        <EnhancedChatInterface initialModel={supportedModel} />
      </div>
    </main>
  )
}
