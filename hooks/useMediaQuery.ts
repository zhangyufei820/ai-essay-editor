/**
 * 📱 沈翔学校 - 媒体查询 Hook (useMediaQuery)
 * 
 * 用于在组件中响应式判断媒体查询是否匹配。
 */

"use client"

import { useState, useEffect, useCallback } from "react"

/**
 * 媒体查询 Hook
 * @param query - CSS 媒体查询字符串，如 "(min-width: 768px)"
 * @returns 是否匹配该媒体查询
 * 
 * @example
 * const isLargeScreen = useMediaQuery("(min-width: 1024px)")
 * const prefersDark = useMediaQuery("(prefers-color-scheme: dark)")
 */
export function useMediaQuery(query: string): boolean {
  // SSR 环境下默认返回 false
  const [matches, setMatches] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    // 检查是否在浏览器环境
    if (typeof window === "undefined") return

    const media = window.matchMedia(query)
    
    // 设置初始值
    setMatches(media.matches)

    // 监听变化
    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    // 使用 addEventListener（现代浏览器）
    media.addEventListener("change", listener)
    
    return () => {
      media.removeEventListener("change", listener)
    }
  }, [query, mounted])

  return matches
}

/**
 * 预设媒体查询
 */
export const mediaQueries = {
  // 断点
  sm: "(min-width: 640px)",
  md: "(min-width: 768px)",
  lg: "(min-width: 1024px)",
  xl: "(min-width: 1280px)",
  "2xl": "(min-width: 1536px)",
  
  // 最大宽度
  maxSm: "(max-width: 639px)",
  maxMd: "(max-width: 767px)",
  maxLg: "(max-width: 1023px)",
  maxXl: "(max-width: 1279px)",
  
  // 设备方向
  portrait: "(orientation: portrait)",
  landscape: "(orientation: landscape)",
  
  // 用户偏好
  prefersDark: "(prefers-color-scheme: dark)",
  prefersLight: "(prefers-color-scheme: light)",
  prefersReducedMotion: "(prefers-reduced-motion: reduce)",
  prefersContrast: "(prefers-contrast: more)",
  
  // 触摸设备
  touch: "(hover: none) and (pointer: coarse)",
  mouse: "(hover: hover) and (pointer: fine)",
  
  // 高分辨率屏幕
  retina: "(-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi)"
} as const

/**
 * 便捷 Hook：是否为暗色模式
 */
export function usePrefersDarkMode(): boolean {
  return useMediaQuery(mediaQueries.prefersDark)
}

/**
 * 便捷 Hook：是否偏好减少动画
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery(mediaQueries.prefersReducedMotion)
}

/**
 * 便捷 Hook：是否为触摸设备
 */
export function useIsTouchDevice(): boolean {
  return useMediaQuery(mediaQueries.touch)
}

/**
 * 便捷 Hook：是否为高分辨率屏幕
 */
export function useIsRetina(): boolean {
  return useMediaQuery(mediaQueries.retina)
}

export default useMediaQuery
