import type { Metadata } from 'next'
import { EssayGrader } from "@/components/essay-grader"

export const metadata: Metadata = {
  title: '作文批改 | 沈翔智学',
  description: 'AI 智能作文批改，上传作文图片即可获得专业点评、修改建议和写作指导',
  openGraph: {
    title: '沈翔智学 - AI 作文批改 | 专业点评与指导',
    description: 'AI 智能作文批改，上传作文图片即可获得专业点评、修改建议和写作指导...',
    url: 'https://shenxiang.school/essay',
  },
  alternates: {
    canonical: 'https://shenxiang.school/essay',
  },
}

export default function EssayPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        <EssayGrader />
      </div>
    </main>
  )
}
