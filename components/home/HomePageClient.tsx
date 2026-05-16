/**
 * 📝 沈翔智学 - 主页（性能优化版）
 * 
 * 整合所有主页板块组件，展示完整的营销页面。
 * 使用动态导入优化首屏加载性能。
 */

'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'

// 首屏组件 - 直接导入（关键路径）
import { HeroSection } from '@/components/home/HeroSection'
import { Header } from '@/components/header'

// 非首屏组件 - 动态导入（懒加载）
const CapabilitiesSection = dynamic(
  () => import('@/components/home/CapabilitiesSection').then(mod => ({ default: mod.CapabilitiesSection })),
  { 
    loading: () => <SectionSkeleton height="600px" />,
    ssr: true 
  }
)

const ProcessSection = dynamic(
  () => import('@/components/home/ProcessSection').then(mod => ({ default: mod.ProcessSection })),
  { 
    loading: () => <SectionSkeleton height="500px" />,
    ssr: true 
  }
)

const TestimonialsSection = dynamic(
  () => import('@/components/home/TestimonialsSection').then(mod => ({ default: mod.TestimonialsSection })),
  { 
    loading: () => <SectionSkeleton height="400px" />,
    ssr: true 
  }
)

const StatsSection = dynamic(
  () => import('@/components/home/StatsSection').then(mod => ({ default: mod.StatsSection })),
  { 
    loading: () => <SectionSkeleton height="300px" />,
    ssr: true 
  }
)

const CTASection = dynamic(
  () => import('@/components/home/CTASection').then(mod => ({ default: mod.CTASection })),
  { 
    loading: () => <SectionSkeleton height="400px" />,
    ssr: true 
  }
)

const HomeFooter = dynamic(
  () => import('@/components/home/HomeFooter').then(mod => ({ default: mod.HomeFooter })),
  { 
    loading: () => <SectionSkeleton height="200px" />,
    ssr: true 
  }
)

// 骨架屏组件
function SectionSkeleton({ height = "400px" }: { height?: string }) {
  return (
    <div 
      className="w-full animate-pulse bg-gradient-to-b from-[var(--color-surface-soft)] to-white"
      style={{ height }}
      role="status"
      aria-label="内容加载中"
    >
      <div className="mx-auto max-w-6xl px-4 py-16">
        <div className="mx-auto mb-8 h-8 w-1/3 rounded-lg bg-muted" />
        <div className="mx-auto mb-4 h-4 w-2/3 rounded bg-muted" />
        <div className="mx-auto h-4 w-1/2 rounded bg-muted" />
      </div>
    </div>
  )
}


export function HomePageClient() {
  return (
    <>
    <Header />
    <main className="min-h-screen bg-[var(--color-surface-soft)]">
      {/* Hero 区域 - 全屏首屏（关键路径，直接加载） */}
      <HeroSection />

      {/* 非首屏内容 - 懒加载 */}
      <Suspense fallback={<SectionSkeleton height="600px" />}>
        <CapabilitiesSection />
      </Suspense>
      
      <Suspense fallback={<SectionSkeleton height="500px" />}>
        <ProcessSection />
      </Suspense>
      
      <Suspense fallback={<SectionSkeleton height="400px" />}>
        <TestimonialsSection />
      </Suspense>
      
      <Suspense fallback={<SectionSkeleton height="300px" />}>
        <StatsSection />
      </Suspense>
      
      <Suspense fallback={<SectionSkeleton height="400px" />}>
        <CTASection />
      </Suspense>
      
      <Suspense fallback={<SectionSkeleton height="200px" />}>
        <HomeFooter />
      </Suspense>
    </main>
    </>
  )
}
