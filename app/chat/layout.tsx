import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI 对话 | 沈翔智学',
  description: '与全球顶尖 AI 模型对话，体验 GPT、Claude、Gemini 等强大模型的智能交互',
  openGraph: {
    title: '沈翔智学 - AI 智能对话 | GPT Claude Gemini',
    description: '与全球顶尖 AI 模型对话，体验 GPT、Claude、Gemini 等强大模型的智能交互...',
    url: 'https://shenxiang.school/chat',
  },
  alternates: {
    canonical: 'https://shenxiang.school/chat',
  },
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.45/dist/katex.min.css" />
      {children}
    </>
  )
}
