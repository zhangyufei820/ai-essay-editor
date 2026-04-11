import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '价格方案 | 沈翔智学',
  description: '基础版28元/月起，解锁无限AI模型调用。提供多种会员套餐，适合不同学习需求。',
  openGraph: {
    title: '沈翔智学 - 价格方案 | AI作文批改会员',
    description: '基础版28元/月起，解锁无限AI模型调用...',
    url: 'https://shenxiang.school/pricing',
  },
  alternates: {
    canonical: 'https://shenxiang.school/pricing',
  },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
