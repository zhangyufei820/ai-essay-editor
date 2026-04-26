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
  'grok-4.2',        // Grok-4.2
  'open-claw',       // Open Claw
  'quanquan-math',   // 全圈数学智能体
  'quanquan-english', // 全圈英语智能体
  'beike-pro',       // 备课助手Pro
  'banzhuren',       // 班主任智能体
  'ai-writing-paper', // 论文写作
  'zhongying-essay', // 中英文作文
  'reading-report',   // 读书报告
  'experiment-report',// 实验报告
  'study-abroad',    // 留学升学文书
  'resume-optimize', // 实习简历优化
  'speech-defense',  // 演讲与答辩稿
  'school-wechat',   // 学校公众号写作
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

// 🍌 Banana 2 Pro 使用与 GPT Image 2 一致的图像工作台界面
const BananaImageWorkspace = dynamic(
  () => import("@/components/chat/gpt-image2-chat-interface").then(mod => {
    const ImageWorkspace = mod.GptImage2ChatInterface
    return {
      default: function BananaWorkspace() {
        return <ImageWorkspace workspaceModel="banana-2-pro" />
      },
    }
  }),
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
    console.log('✅ [ModelChatPage] 使用 Banana 图像工作台')
    return (
      <main className="flex min-h-screen flex-col">
        <div className="flex-1">
          <BananaImageWorkspace />
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
