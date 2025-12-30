"use client"

import dynamic from 'next/dynamic'
import { useParams, notFound } from 'next/navigation'

// 🎯 支持的模型/智能体列表
// 新增智能体时，只需在此处添加即可
const SUPPORTED_MODELS = [
  'standard',        // 作文批改（默认）
  'teaching-pro',    // 教学评助手
  'gpt-5',           // ChatGPT 5.1
  'claude-opus',     // Claude Opus 4.5
  'gemini-pro',      // Gemini 3.0 Pro
  'banana-2-pro',    // Banana 2 Pro (图像)
  'suno-v5',         // Suno V5 (音乐)
  'sora-2-pro',      // Sora 2 Pro (视频)
] as const

export type SupportedModel = typeof SUPPORTED_MODELS[number]

// 动态导入 EnhancedChatInterface，禁用 SSR
const EnhancedChatInterface = dynamic(
  () => import("@/components/chat/enhanced-chat-interface").then(mod => ({ default: mod.EnhancedChatInterface })),
  { 
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-green-200 border-t-green-700 rounded-full animate-spin"></div>
          <p className="text-slate-500 text-sm">加载对话界面...</p>
        </div>
      </div>
    )
  }
)

export default function ModelChatPage() {
  const params = useParams()
  const model = params.model as string
  
  // 验证模型是否支持
  if (!SUPPORTED_MODELS.includes(model as SupportedModel)) {
    notFound()
  }

  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex-1">
        <EnhancedChatInterface initialModel={model as SupportedModel} />
      </div>
    </main>
  )
}
