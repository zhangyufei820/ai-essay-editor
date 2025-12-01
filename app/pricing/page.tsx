'use client'

import { Pricing } from "@/components/pricing" // 复用你已有的组件
import { Footer } from "@/components/footer"

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      {/* 我们可以给顶部加一点留白，让它看起来不像直接贴在顶部的 */}
      <div className="pt-10">
        <Pricing />
      </div>
      <Footer />
    </main>
  )
}