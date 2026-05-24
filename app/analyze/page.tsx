import type { Metadata } from 'next'
import { EssayGrader } from "@/components/essay-grader"

export const metadata: Metadata = {
  title: '作文分析与批改 | 沈翔智学',
  description: '上传作文图片或输入作文内容，AI 逐段批改、指出问题并给出提分建议',
  openGraph: {
    title: '沈翔智学 - 作文分析与批改',
    description: '上传作文图片或输入作文内容，AI 逐段批改、指出问题并给出提分建议。',
    url: 'https://shenxiang.school/analyze',
  },
  alternates: {
    canonical: 'https://shenxiang.school/analyze',
  },
}

export default function AnalyzePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        <EssayGrader />
      </div>
    </main>
  )
}
