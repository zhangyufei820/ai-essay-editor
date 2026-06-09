import type { Metadata } from 'next'
import { GptImage2ChatInterface } from '@/components/chat/gpt-image2-chat-interface'

export const metadata: Metadata = {
  title: '高质量图像 | 沈翔智学',
  description: 'AI 图像生成与编辑工作台',
}

export default function GptImage2Page() {
  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex-1">
        <GptImage2ChatInterface />
      </div>
    </main>
  )
}
