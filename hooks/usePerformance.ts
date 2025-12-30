/**
 * 📊 沈翔学校 - 性能监控 Hook (Performance Monitoring)
 * 
 * 监控和上报 Web Vitals 指标。
 */

import { useEffect, useCallback, useRef } from 'react'

// ============================================
// 类型定义
// ============================================

export interface WebVitalsMetric {
  id: string
  name: 'CLS' | 'FCP' | 'FID' | 'INP' | 'LCP' | 'TTFB'
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  delta: number
  navigationType: string
}

export interface PerformanceData {
  // Core Web Vitals
  lcp?: number  // Largest Contentful Paint
  fid?: number  // First Input Delay
  cls?: number  // Cumulative Layout Shift
  // 其他指标
  fcp?: number  // First Contentful Paint
  ttfb?: number // Time to First Byte
  inp?: number  // Interaction to Next Paint
}

// ============================================
// 性能阈值
// ============================================

const thresholds = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
  INP: { good: 200, poor: 500 },
}

// ============================================
// 获取评级
// ============================================

function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const threshold = thresholds[name as keyof typeof thresholds]
  if (!threshold) return 'good'
  
  if (value <= threshold.good) return 'good'
  if (value <= threshold.poor) return 'needs-improvement'
  return 'poor'
}

// ============================================
// 性能监控 Hook
// ============================================

export function usePerformance(options?: {
  /** 是否启用 */
  enabled?: boolean
  /** 上报回调 */
  onReport?: (metric: WebVitalsMetric) => void
  /** 是否打印到控制台 */
  debug?: boolean
}) {
  const { enabled = true, onReport, debug = false } = options || {}
  const metricsRef = useRef<PerformanceData>({})

  // 处理指标
  const handleMetric = useCallback((metric: WebVitalsMetric) => {
    // 存储指标
    const key = metric.name.toLowerCase() as keyof PerformanceData
    metricsRef.current[key] = metric.value

    // 调试输出
    if (debug) {
      const emoji = metric.rating === 'good' ? '✅' : metric.rating === 'needs-improvement' ? '⚠️' : '❌'
      console.log(
        `${emoji} [Web Vitals] ${metric.name}: ${metric.value.toFixed(2)} (${metric.rating})`
      )
    }

    // 上报回调
    onReport?.(metric)
  }, [debug, onReport])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    // 动态导入 web-vitals
    import('web-vitals').then(({ onCLS, onFCP, onFID, onINP, onLCP, onTTFB }) => {
      onCLS((metric) => handleMetric({
        ...metric,
        rating: getRating('CLS', metric.value)
      } as WebVitalsMetric))
      
      onFCP((metric) => handleMetric({
        ...metric,
        rating: getRating('FCP', metric.value)
      } as WebVitalsMetric))
      
      onFID((metric) => handleMetric({
        ...metric,
        rating: getRating('FID', metric.value)
      } as WebVitalsMetric))
      
      onINP((metric) => handleMetric({
        ...metric,
        rating: getRating('INP', metric.value)
      } as WebVitalsMetric))
      
      onLCP((metric) => handleMetric({
        ...metric,
        rating: getRating('LCP', metric.value)
      } as WebVitalsMetric))
      
      onTTFB((metric) => handleMetric({
        ...metric,
        rating: getRating('TTFB', metric.value)
      } as WebVitalsMetric))
    }).catch(() => {
      // web-vitals 未安装，静默失败
      if (debug) {
        console.warn('[Performance] web-vitals not installed')
      }
    })
  }, [enabled, handleMetric, debug])

  // 获取当前指标
  const getMetrics = useCallback(() => metricsRef.current, [])

  return { getMetrics }
}

// ============================================
// 渲染性能 Hook
// ============================================

export function useRenderPerformance(componentName: string, enabled = false) {
  const renderCount = useRef(0)
  const lastRenderTime = useRef(performance.now())

  useEffect(() => {
    if (!enabled) return

    renderCount.current++
    const now = performance.now()
    const timeSinceLastRender = now - lastRenderTime.current
    lastRenderTime.current = now

    console.log(
      `🔄 [Render] ${componentName}: #${renderCount.current} (${timeSinceLastRender.toFixed(2)}ms since last)`
    )
  })

  return renderCount.current
}

// ============================================
// 内存监控 Hook
// ============================================

export function useMemoryMonitor(options?: {
  interval?: number
  threshold?: number
  onWarning?: (usage: number) => void
}) {
  const { interval = 30000, threshold = 0.9, onWarning } = options || {}

  useEffect(() => {
    if (typeof window === 'undefined') return
    
    // 检查是否支持 memory API
    const performance = window.performance as any
    if (!performance?.memory) return

    const checkMemory = () => {
      const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory
      const usage = usedJSHeapSize / jsHeapSizeLimit

      if (usage > threshold) {
        console.warn(`⚠️ [Memory] High usage: ${(usage * 100).toFixed(1)}%`)
        onWarning?.(usage)
      }
    }

    const timer = setInterval(checkMemory, interval)
    return () => clearInterval(timer)
  }, [interval, threshold, onWarning])
}

// ============================================
// 默认导出
// ============================================

export default usePerformance
