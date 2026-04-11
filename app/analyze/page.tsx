import type { Metadata } from 'next'
import EssayAnalyzer from "@/components/essay-analyzer"

export const metadata: Metadata = {
  title: '作文分析 | 沈翔智学',
  description: 'AI 深度分析作文结构、立意、表达，提供针对性改进建议',
  openGraph: {
    title: '沈翔智学 - 作文分析 | AI 深度点评',
    description: 'AI 深度分析作文结构、立意、表达，提供针对性改进建议...',
    url: 'https://shenxiang.school/analyze',
  },
  alternates: {
    canonical: 'https://shenxiang.school/analyze',
  },
}

export default function AnalyzePage() {
  return <EssayAnalyzer />
}
