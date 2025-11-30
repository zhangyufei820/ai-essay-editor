"use client"

import { EnhancedChatInterface } from "@/components/chat/enhanced-chat-interface"
import { Header } from "@/components/header"

export default function ChatPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <Header />
      <div className="flex-1">
        <EnhancedChatInterface />
      </div>
    </main>
  )
}
