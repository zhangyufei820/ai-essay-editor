import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI 对话 | 沈翔智学',
  description: '与沈翔智学智能助手对话，体验写作、学习、图文理解和创作能力。',
  openGraph: {
    title: '沈翔智学 - AI 智能对话',
    description: '与沈翔智学智能助手对话，体验写作、学习、图文理解和创作能力。',
    url: 'https://shenxiang.school/chat',
  },
  alternates: {
    canonical: 'https://shenxiang.school/chat',
  },
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children
}
