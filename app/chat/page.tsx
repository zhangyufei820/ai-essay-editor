"use client"

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { LoadingStateCard } from '@/components/ui/LoadingStateCard'
import { buildChatSessionRoute, normalizeChatSessionModel } from '@/lib/chat-session-routes'

// 动态导入 EnhancedChatInterface，禁用 SSR
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

    // 🚀 如果是 banana-2-pro，自动跳转到专用页面
    if (normalizedModel === 'banana-2-pro' || normalizedModel === 'gpt-image-2') {
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
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
        <LoadingStateCard modelKey="standard" />
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  )
}
