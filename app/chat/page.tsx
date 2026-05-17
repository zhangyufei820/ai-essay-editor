"use client"

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { LoadingStateV2 } from '@/components/ui/v2'
import { buildChatSessionRoute, normalizeChatSessionModel } from '@/lib/chat-session-routes'

// 动态导入 EnhancedChatInterface，禁用 SSR
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

// 🔥 将使用 useSearchParams 的逻辑提取到单独的组件中
function ChatPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // 🔍 检查 URL 参数中的模型
    const model = searchParams.get('model') || searchParams.get('agent')
    const sessionId = searchParams.get('sessionId') || searchParams.get('id') || searchParams.get('session')
    const normalizedModel = normalizeChatSessionModel(model)
    console.log('🔍 [ChatPage] URL 参数 model:', model)

    // 🚀 专用图像模型自动跳转到独立工作台
    if (normalizedModel === 'gemini-image' || normalizedModel === 'gpt-image-2') {
      console.log('✅ [ChatPage] 检测到专用模型，跳转到专用页面')
      router.replace(sessionId ? buildChatSessionRoute(sessionId, normalizedModel) : `/chat/${normalizedModel}`)
    }
  }, [searchParams, router])

  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex-1">
        <EnhancedChatInterface />
      </div>
    </main>
  )
}

// 🔥 用 Suspense 包裹使用 useSearchParams 的组件
export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--paper-50)]">
        <LoadingStateV2 label="AI 正在思考..." size="md" />
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  )
}
