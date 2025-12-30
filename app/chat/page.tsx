"use client"

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

export default function ChatPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex-1">
        <EnhancedChatInterface />
      </div>
    </main>
  )
}
