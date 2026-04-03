/**
 * 📝 沈翔学校 - 主页（性能优化版）
 * 
 * 整合所有主页板块组件，展示完整的营销页面。
 * 使用动态导入优化首屏加载性能。
 */

'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

// 首屏组件 - 直接导入（关键路径）
import { HeroSection } from '@/components/home'
import { OpenClawSection } from '@/components/home'

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

// 加载状态组件
function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-green-200 border-t-green-700 rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">加载中...</p>
      </div>
    </div>
  )
}

export default function Home() {
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // 检查是否登录
    const user = localStorage.getItem('currentUser')
    
    if (!user) {
      // 没登录 -> 踢到登录页
      router.replace('/login')
    } else {
      // 登录了 -> 显示正常的网站内容
      setIsAuthorized(true)
    }
    setIsLoading(false)
  }, [router])

  // 加载中显示骨架屏
  if (isLoading) {
    return <LoadingScreen />
  }

  // 未授权不渲染
  if (!isAuthorized) {
    return null 
  }

  return (
    <main className="min-h-screen bg-white">
      {/* Hero 区域 - 全屏首屏（关键路径，直接加载） */}
      <HeroSection />

      {/* OpenClaw 专区 */}
      <OpenClawSection />

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
