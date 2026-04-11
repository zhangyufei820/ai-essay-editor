import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI 智能体对话 | 沈翔智学',
  description: '与专业 AI 智能体对话，获取作文批改、学习规划等专项服务',
  openGraph: {
    title: '沈翔智学 - AI 智能体 | 专项智能服务',
    description: '与专业 AI 智能体对话，获取作文批改、学习规划等专项服务...',
    url: 'https://shenxiang.school/chat',
  },
  alternates: {
    canonical: 'https://shenxiang.school/chat',
  },
}

export default function ChatModelLayout({ children }: { children: React.ReactNode }) {
  return children
}
