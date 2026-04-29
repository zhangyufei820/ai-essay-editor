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

type PerformanceMetricName = keyof typeof thresholds

interface LayoutShiftEntry extends PerformanceEntry {
  value?: number
  hadRecentInput?: boolean
}

interface PerformanceEventTimingEntry extends PerformanceEntry {
  processingStart?: number
  startTime: number
}

interface LargestContentfulPaintEntry extends PerformanceEntry {
  startTime: number
}

interface PerformanceNavigationTimingWithResponseStart extends PerformanceNavigationTiming {
  responseStart: number
}

// ============================================
// 获取评级
// ============================================

function getRating(name: PerformanceMetricName, value: number): 'good' | 'needs-improvement' | 'poor' {
  const threshold = thresholds[name]
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

    const observers: PerformanceObserver[] = []
    const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTimingWithResponseStart | undefined
    const reportMetric = (name: PerformanceMetricName, value: number, delta = value) => {
      handleMetric({
        id: `${name}-${Date.now()}`,
        name,
        value,
        delta,
        rating: getRating(name, value),
        navigationType: navigationEntry?.type || 'navigate',
      })
    }

    if (navigationEntry?.responseStart !== undefined) {
      reportMetric('TTFB', navigationEntry.responseStart)
    }

    const paintEntries = performance.getEntriesByType('paint')
    const fcpEntry = paintEntries.find((entry) => entry.name === 'first-contentful-paint')
    if (fcpEntry) {
      reportMetric('FCP', fcpEntry.startTime)
    }

    const createObserver = (
      type: PerformanceEntryList['0']['entryType'],
      callback: (entries: PerformanceEntry[]) => void,
    ) => {
      if (typeof PerformanceObserver === 'undefined') return
      try {
        const observer = new PerformanceObserver((list) => callback(list.getEntries()))
        observer.observe({ type, buffered: true })
        observers.push(observer)
      } catch {
        if (debug) {
          console.warn(`[Performance] Observer not supported for ${type}`)
        }
      }
    }

    createObserver('largest-contentful-paint', (entries) => {
      const lastEntry = entries.at(-1) as LargestContentfulPaintEntry | undefined
      if (lastEntry) {
        reportMetric('LCP', lastEntry.startTime)
      }
    })

    let clsValue = 0
    createObserver('layout-shift', (entries) => {
      for (const entry of entries as LayoutShiftEntry[]) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value ?? 0
        }
      }
      if (clsValue > 0) {
        reportMetric('CLS', clsValue, clsValue)
      }
    })

    createObserver('first-input', (entries) => {
      const firstEntry = entries[0] as PerformanceEventTimingEntry | undefined
      if (firstEntry?.processingStart !== undefined) {
        reportMetric('FID', firstEntry.processingStart - firstEntry.startTime)
      }
    })

    createObserver('event', (entries) => {
      const interactionEntries = entries as PerformanceEventTimingEntry[]
      const maxInteraction = interactionEntries.reduce((max, entry) => {
        if (entry.processingStart === undefined) return max
        return Math.max(max, entry.processingStart - entry.startTime)
      }, 0)

      if (maxInteraction > 0) {
        reportMetric('INP', maxInteraction, maxInteraction)
      }
    })

    return () => {
      for (const observer of observers) {
        observer.disconnect()
      }
    }
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
