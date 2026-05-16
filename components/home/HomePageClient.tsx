/**
 * 📝 沈翔智学 - 主页
 *
 * 只保留可用的首页模块，移除重复壳和占位展示。
 */

"use client"

import { HeroSection } from "@/components/home/HeroSection"
import { CapabilitiesSection } from "@/components/home/CapabilitiesSection"
import { ProcessSection } from "@/components/home/ProcessSection"
import { TestimonialsSection } from "@/components/home/TestimonialsSection"
import { HomeFooter } from "@/components/home/HomeFooter"

export function HomePageClient() {
  return (
    <main className="min-h-screen bg-[var(--color-surface-soft)]">
      <HeroSection />
      <CapabilitiesSection />
      <ProcessSection />
      <TestimonialsSection />
      <HomeFooter />
    </main>
  )
}
