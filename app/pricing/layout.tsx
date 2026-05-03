import type { Metadata } from 'next'

// Pricing page should always render fresh to avoid stale RSC/action references
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: '价格方案 | 沈翔智学',
  description: '基础版28元/月到账2,000积分，专业版68元/月到账5,000积分，豪华版128元/月到账12,000积分。文本按输入和输出token计费。',
  openGraph: {
    title: '沈翔智学 - 价格方案 | AI作文批改会员',
    description: '会员套餐、积分包和文本生成积分规则说明。',
    url: 'https://shenxiang.school/pricing',
  },
  alternates: {
    canonical: 'https://shenxiang.school/pricing',
  },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
