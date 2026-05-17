import type { Metadata } from "next"
import { PricingPageV2 } from "@/components/pricing/v2/PricingPageV2"

export const metadata: Metadata = {
  title: "套餐与价格 | 沈翔智学",
  description: "选择适合你的学习方案，所有方案包含 22 个 AI 智能体。",
}

export default function PricingPage() {
  return <PricingPageV2 />
}
