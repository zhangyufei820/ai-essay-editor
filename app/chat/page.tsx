"use client"

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { LoadingStateCard } from '@/components/ui/LoadingStateCard'

// 动态导入 EnhancedChatInterface，禁用 SSR
const EnhancedChatInterface = dynamic(
  () => import("@/components/chat/enhanced-chat-interface").then(mod => ({ default: mod.EnhancedChatInterface })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-white">
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
    const model = searchParams.get('model')
    console.log('🔍 [ChatPage] URL 参数 model:', model)

    // 🚀 如果是 banana-2-pro，自动跳转到专用页面
    if (model === 'banana-2-pro') {
      console.log('✅ [ChatPage] 检测到 banana-2-pro，跳转到专用页面')
      router.push('/chat/banana-2-pro')
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
      <div className="min-h-screen flex items-center justify-center bg-white">
        <LoadingStateCard modelKey="standard" />
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  )
}
