"use client"

import dynamic from 'next/dynamic'
import { useParams, notFound } from 'next/navigation'
import { LoadingStateCard } from '@/components/ui/LoadingStateCard'

// 🎯 支持的模型/智能体列表
// 新增智能体时，只需在此处添加即可
const SUPPORTED_MODELS = [
  'standard',        // 作文批改（默认）
  'teaching-pro',    // 教学评助手
  'gpt-5',           // ChatGPT 5.4
  'claude-opus',     // Claude opus4.6thinking
  'gemini-pro',      // Gemini 3.1 pro
  'banana-2-pro',    // Banana 2 Pro (图像)
  'suno-v5',         // Suno V5 (音乐)
  'sora-2-pro',      // Sora 2 Pro (视频)
  'grok-4.2',        // Grok-4.2
  'open-claw',       // Open Claw
  'quanquan-math',   // 全圈数学智能体
  'quanquan-english', // 全圈英语智能体
  'beike-pro',       // 倍克Pro智能体
  'banzhuren',       // 班主任智能体
] as const

export type SupportedModel = typeof SUPPORTED_MODELS[number]

// 🔥 动态导入通用聊天界面
const EnhancedChatInterface = dynamic(
  () => import("@/components/chat/enhanced-chat-interface").then(mod => ({ default: mod.EnhancedChatInterface })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
        <LoadingStateCard modelKey="standard" />
      </div>
    )
  }
)

// 🍌 动态导入 Banana 2 Pro 专用界面
const BananaChatInterface = dynamic(
  () => import("@/components/chat/banana-chat-interface").then(mod => ({ default: mod.BananaChatInterface })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
        <LoadingStateCard modelKey="banana-2-pro" />
      </div>
    )
  }
)

export default function ModelChatPage() {
  const params = useParams()
  const model = params.model as string

  // 🔍 调试日志
  console.log('🔍 [ModelChatPage] 当前模型:', model)
  console.log('🔍 [ModelChatPage] 是否为 banana-2-pro:', model === 'banana-2-pro')

  // 验证模型是否支持
  if (!SUPPORTED_MODELS.includes(model as SupportedModel)) {
    notFound()
  }

  // 🔥 根据模型选择不同的界面组件
  if (model === 'banana-2-pro') {
    console.log('✅ [ModelChatPage] 使用 BananaChatInterface')
    return (
      <main className="flex min-h-screen flex-col">
        <div className="flex-1">
          <BananaChatInterface />
        </div>
      </main>
    )
  }

  // 其他模型使用通用界面
  console.log('⚠️ [ModelChatPage] 使用 EnhancedChatInterface，模型:', model)
  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex-1">
        <EnhancedChatInterface initialModel={model as SupportedModel} />
      </div>
    </main>
  )
}
