import type { Metadata } from 'next'
import { BananaChatInterface } from '@/components/chat/banana-chat-interface'

export const metadata: Metadata = {
  title: 'banana | 沈翔智学',
  description: 'AI 图像生成 - banana',
}

export default function CreativeImageBananaPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex-1">
        <BananaChatInterface />
      </div>
    </main>
  )
}