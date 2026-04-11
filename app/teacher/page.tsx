import type { Metadata } from 'next'
import { Footer } from "@/components/footer"
import { TeacherHero } from "@/components/teacher/hero"
import { TeacherResources } from "@/components/teacher/resources"
import { TeacherDevelopment } from "@/components/teacher/development"
import { TeacherCommunity } from "@/components/teacher/community"

export const metadata: Metadata = {
  title: '教师专区 | 沈翔智学',
  description: 'AI 赋能教学，教师专属资源、教案生成、教学工具，提升教学效率',
  openGraph: {
    title: '沈翔智学 - 教师专区 | AI 赋能教学',
    description: 'AI 赋能教学，教师专属资源、教案生成、教学工具，提升教学效率...',
    url: 'https://shenxiang.school/teacher',
  },
  alternates: {
    canonical: 'https://shenxiang.school/teacher',
  },
}

export default function TeacherPage() {
  return (
    <main className="min-h-screen">
      <TeacherHero />
      <TeacherResources />
      <TeacherDevelopment />
      <TeacherCommunity />
      <Footer />
    </main>
  )
}
