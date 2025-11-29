"use client"

import { EnhancedChatInterface } from "@/components/chat/enhanced-chat-interface"

export default function ChatPage() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* Header component removed */}
      <div className="flex-1">
        <EnhancedChatInterface />
      </div>
    </main>
  )
}
