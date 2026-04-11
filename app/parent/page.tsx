import type { Metadata } from 'next'
import { Footer } from "@/components/footer"
import { ParentHero } from "@/components/parent/hero"
import { ParentFeatures } from "@/components/parent/features"
import { ParentInteraction } from "@/components/parent/interaction"
import { ParentGrowth } from "@/components/parent/growth"
import { ParentAI } from "@/components/parent/ai-learning"

export const metadata: Metadata = {
  title: '家长专区 | 沈翔智学',
  description: '家长好帮手，AI 辅助孩子学习、个性化培养方案、学习效果跟踪',
  openGraph: {
    title: '沈翔智学 - 家长专区 | AI 辅助孩子学习',
    description: '家长好帮手，AI 辅助孩子学习、个性化培养方案、学习效果跟踪...',
    url: 'https://shenxiang.school/parent',
  },
  alternates: {
    canonical: 'https://shenxiang.school/parent',
  },
}

export default function ParentPage() {
  return (
    <main className="min-h-screen">
      <ParentHero />
      <ParentFeatures />
      <ParentInteraction />
      <ParentGrowth />
      <ParentAI />
      <Footer />
    </main>
  )
}
