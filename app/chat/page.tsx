"use client"

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'

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
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-green-200 border-t-green-700 rounded-full animate-spin"></div>
          <p className="text-slate-500 text-sm">加载中...</p>
        </div>
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  )
}
