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
import { HeroSection } from '@/components/home'
import { GptImagePromoModal } from '@/components/home'
import { OpenClawSection } from '@/components/home'
import { Calculator, HelpCircle, FileText, Sparkles, ArrowRight } from 'lucide-react'

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
      className="w-full animate-pulse bg-gradient-to-b from-slate-50 to-white"
      style={{ height }}
    >
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="h-8 bg-slate-100 rounded-lg w-1/3 mx-auto mb-8" />
        <div className="h-4 bg-slate-100 rounded w-2/3 mx-auto mb-4" />
        <div className="h-4 bg-slate-100 rounded w-1/2 mx-auto" />
      </div>
    </div>
  )
}


export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <GptImagePromoModal />
      {/* Hero 区域 - 全屏首屏（关键路径，直接加载） */}
      <HeroSection />

      {/* OpenClaw 专区 */}
      <OpenClawSection />

      {/* 🔥 快捷入口卡片 */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-10 text-slate-800">快捷入口</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {/* 全学段数学 */}
            <a
              href="/chat/quanquan-math"
              className="group relative bg-white rounded-2xl p-6 md:p-8 border border-slate-100 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Calculator className="w-7 h-7 md:w-8 md:h-8 text-emerald-600" />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold text-slate-800 mb-1">全学段数学</h3>
                  <p className="text-xs text-slate-400 hidden md:block">数学问题解答</p>
                </div>
              </div>
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRight className="w-4 h-4 text-emerald-500" />
              </div>
            </a>

            {/* 题目解析 */}
            <a
              href="/chat/problem"
              className="group relative bg-white rounded-2xl p-6 md:p-8 border border-slate-100 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <HelpCircle className="w-7 h-7 md:w-8 md:h-8 text-emerald-600" />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold text-slate-800 mb-1">题目解析</h3>
                  <p className="text-xs text-slate-400 hidden md:block">分步详细讲解</p>
                </div>
              </div>
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRight className="w-4 h-4 text-emerald-500" />
              </div>
            </a>

            {/* 作文批改 */}
            <a
              href="/chat/standard"
              className="group relative bg-white rounded-2xl p-6 md:p-8 border border-slate-100 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileText className="w-7 h-7 md:w-8 md:h-8 text-emerald-600" />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold text-slate-800 mb-1">作文批改</h3>
                  <p className="text-xs text-slate-400 hidden md:block">专业点评建议</p>
                </div>
              </div>
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRight className="w-4 h-4 text-emerald-500" />
              </div>
            </a>

            {/* AI写作 */}
            <a
              href="/chat/ai-writing-paper"
              className="group relative bg-white rounded-2xl p-6 md:p-8 border border-slate-100 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Sparkles className="w-7 h-7 md:w-8 md:h-8 text-emerald-600" />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold text-slate-800 mb-1">创意写作</h3>
                  <p className="text-xs text-slate-400 hidden md:block">激发创作灵感</p>
                </div>
              </div>
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRight className="w-4 h-4 text-emerald-500" />
              </div>
            </a>
          </div>
        </div>
      </section>

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
  )
}
