/**
 * 📐 沈翔学校 - 断点 Hook (useBreakpoint)
 * 
 * 用于在组件中响应式判断当前屏幕尺寸断点。
 * 断点与 Tailwind CSS 保持一致。
 */

"use client"

import { useState, useEffect, useMemo, useCallback } from "react"

// ============================================
// 类型定义
// ============================================

export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl" | "2xl"

// ============================================
// 断点配置（与 Tailwind 一致）
// ============================================

export const breakpoints = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536
} as const

// ============================================
// 防抖函数
// ============================================

function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): T {
  let timeoutId: ReturnType<typeof setTimeout>
  return ((...args: unknown[]) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }) as T
}

// ============================================
// 获取当前断点
// ============================================

function getBreakpoint(width: number): Breakpoint {
  if (width >= breakpoints["2xl"]) return "2xl"
  if (width >= breakpoints.xl) return "xl"
  if (width >= breakpoints.lg) return "lg"
  if (width >= breakpoints.md) return "md"
  if (width >= breakpoints.sm) return "sm"
  return "xs"
}

// ============================================
// useBreakpoint Hook
// ============================================

/**
 * 获取当前断点
 * @param debounceMs - 防抖延迟（毫秒），默认 100
 * @returns 当前断点名称
 * 
 * @example
 * const breakpoint = useBreakpoint()
 * // breakpoint: "xs" | "sm" | "md" | "lg" | "xl" | "2xl"
 */
export function useBreakpoint(debounceMs: number = 100): Breakpoint {
  // SSR 环境下默认返回 "xs"
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("xs")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    if (typeof window === "undefined") return

    const handleResize = debounce(() => {
      const width = window.innerWidth
      setBreakpoint(getBreakpoint(width))
    }, debounceMs)

    // 设置初始值
    setBreakpoint(getBreakpoint(window.innerWidth))

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [mounted, debounceMs])

  return breakpoint
}

// ============================================
// useWindowSize Hook
// ============================================

interface WindowSize {
  width: number
  height: number
}

/**
 * 获取窗口尺寸
 * @param debounceMs - 防抖延迟（毫秒），默认 100
 * @returns 窗口宽高
 */
export function useWindowSize(debounceMs: number = 100): WindowSize {
  const [size, setSize] = useState<WindowSize>({ width: 0, height: 0 })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    if (typeof window === "undefined") return

    const handleResize = debounce(() => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight
      })
    }, debounceMs)

    // 设置初始值
    setSize({
      width: window.innerWidth,
      height: window.innerHeight
    })

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [mounted, debounceMs])

  return size
}

// ============================================
// 便捷 Hooks
// ============================================

/**
 * 是否为移动端（xs 或 sm）
 */
export function useIsMobile(): boolean {
  const breakpoint = useBreakpoint()
  return breakpoint === "xs" || breakpoint === "sm"
}

/**
 * 是否为平板（md）
 */
export function useIsTablet(): boolean {
  const breakpoint = useBreakpoint()
  return breakpoint === "md"
}

/**
 * 是否为桌面端（lg 及以上）
 */
export function useIsDesktop(): boolean {
  const breakpoint = useBreakpoint()
  return breakpoint === "lg" || breakpoint === "xl" || breakpoint === "2xl"
}

/**
 * 是否大于等于指定断点
 */
export function useBreakpointUp(target: Breakpoint): boolean {
  const breakpoint = useBreakpoint()
  const breakpointOrder: Breakpoint[] = ["xs", "sm", "md", "lg", "xl", "2xl"]
  const currentIndex = breakpointOrder.indexOf(breakpoint)
  const targetIndex = breakpointOrder.indexOf(target)
  return currentIndex >= targetIndex
}

/**
 * 是否小于指定断点
 */
export function useBreakpointDown(target: Breakpoint): boolean {
  const breakpoint = useBreakpoint()
  const breakpointOrder: Breakpoint[] = ["xs", "sm", "md", "lg", "xl", "2xl"]
  const currentIndex = breakpointOrder.indexOf(breakpoint)
  const targetIndex = breakpointOrder.indexOf(target)
  return currentIndex < targetIndex
}

/**
 * 是否在指定断点范围内
 */
export function useBreakpointBetween(min: Breakpoint, max: Breakpoint): boolean {
  const breakpoint = useBreakpoint()
  const breakpointOrder: Breakpoint[] = ["xs", "sm", "md", "lg", "xl", "2xl"]
  const currentIndex = breakpointOrder.indexOf(breakpoint)
  const minIndex = breakpointOrder.indexOf(min)
  const maxIndex = breakpointOrder.indexOf(max)
  return currentIndex >= minIndex && currentIndex <= maxIndex
}

// ============================================
// 断点信息 Hook
// ============================================

interface BreakpointInfo {
  breakpoint: Breakpoint
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  width: number
  height: number
}

/**
 * 获取完整的断点信息
 */
export function useBreakpointInfo(): BreakpointInfo {
  const breakpoint = useBreakpoint()
  const { width, height } = useWindowSize()

  return useMemo(() => ({
    breakpoint,
    isMobile: breakpoint === "xs" || breakpoint === "sm",
    isTablet: breakpoint === "md",
    isDesktop: breakpoint === "lg" || breakpoint === "xl" || breakpoint === "2xl",
    width,
    height
  }), [breakpoint, width, height])
}

// ============================================
// 默认导出
// ============================================

export default useBreakpoint
