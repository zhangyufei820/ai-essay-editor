/**
 * 📝 沈翔智学 - 主页（性能优化版）
 * 
 * 整合所有主页板块组件，展示完整的营销页面。
 * 使用动态导入优化首屏加载性能。
 */

'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'

// 首屏组件 - 直接导入（关键路径）
import { HeroSection } from '@/components/home/HeroSection'
import { ClipboardCheck, HelpCircle, FileText, Sparkles, ArrowRight } from 'lucide-react'

const OpenClawSection = dynamic(
  () => import('@/components/home/OpenClawSection').then(mod => ({ default: mod.OpenClawSection })),
  {
    loading: () => <SectionSkeleton height="520px" />,
    ssr: true
  }
)

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


export default function Home() {
  const quickEntries = [
    {
      href: "/worksheet-diagnosis",
      title: "错题诊断海报",
      description: "拍卷子生成反馈",
      icon: ClipboardCheck,
    },
    {
      href: "/chat/problem",
      title: "题目解析",
      description: "分步详细讲解",
      icon: HelpCircle,
    },
    {
      href: "/essay",
      title: "作文批改",
      description: "专业点评建议",
      icon: FileText,
    },
    {
      href: "/chat/ai-writing-paper",
      title: "创意写作",
      description: "激发创作灵感",
      icon: Sparkles,
    },
  ]

  return (
    <main className="min-h-screen bg-white">
      {/* Hero 区域 - 全屏首屏（关键路径，直接加载） */}
      <HeroSection />

      {/* OpenClaw 专区 */}
      <OpenClawSection />

      {/* 🔥 快捷入口卡片 */}
      <section className="sx-section bg-white">
        <div className="sx-container">
          <div className="mb-10 text-center md:mb-12">
            <span className="mb-3 inline-flex rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              高频工具
            </span>
            <h2 className="sx-section-title">快捷入口</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 md:gap-6">
            {quickEntries.map((entry) => {
              const Icon = entry.icon

              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className="group sx-card sx-card-interactive relative min-h-[154px] overflow-hidden p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:p-5 md:min-h-[184px] md:p-6"
                >
                  <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                    <div className="flex size-14 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 shadow-sm transition-transform duration-200 group-hover:scale-105 md:size-16">
                      <Icon className="size-7 text-primary md:size-8" />
                    </div>
                    <div>
                      <h3 className="mb-1 text-sm font-bold text-foreground sm:text-base">{entry.title}</h3>
                      <p className="hidden text-xs leading-5 text-muted-foreground md:block">{entry.description}</p>
                    </div>
                  </div>
                  <div className="absolute right-3 top-3 rounded-full bg-primary/10 p-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                    <ArrowRight className="size-4 text-primary" />
                  </div>
                </Link>
              )
            })}
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
