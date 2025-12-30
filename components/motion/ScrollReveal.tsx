/**
 * 👁️ 沈翔学校 - 滚动触发动画组件 (Scroll Reveal)
 * 
 * 通用的滚动触发动画包装器，当元素进入视口时触发动画。
 */

"use client"

import { motion, type Variants, type Easing } from "framer-motion"
import { cn } from "@/lib/utils"

// ============================================
// 类型定义
// ============================================

interface ScrollRevealProps {
  children: React.ReactNode
  /** 动画方向 */
  direction?: "up" | "down" | "left" | "right" | "none"
  /** 延迟时间（秒） */
  delay?: number
  /** 动画时长（秒） */
  duration?: number
  /** 位移距离（像素） */
  distance?: number
  /** 是否只触发一次 */
  once?: boolean
  /** 触发阈值（0-1，元素可见比例） */
  threshold?: number
  /** 自定义类名 */
  className?: string
  /** 是否包含缩放效果 */
  scale?: boolean
  /** 初始缩放值 */
  initialScale?: number
}

// ============================================
// 缓动函数
// ============================================

const easeOut: Easing = [0.33, 1, 0.68, 1]

// ============================================
// 滚动触发动画组件
// ============================================

export function ScrollReveal({
  children,
  direction = "up",
  delay = 0,
  duration = 0.5,
  distance = 24,
  once = true,
  threshold = 0.1,
  className,
  scale = false,
  initialScale = 0.95
}: ScrollRevealProps) {
  
  // 根据方向获取初始位置
  const getInitialPosition = () => {
    switch (direction) {
      case "up": return { y: distance, x: 0 }
      case "down": return { y: -distance, x: 0 }
      case "left": return { x: distance, y: 0 }
      case "right": return { x: -distance, y: 0 }
      case "none": return { x: 0, y: 0 }
    }
  }

  const variants: Variants = {
    hidden: {
      opacity: 0,
      ...getInitialPosition(),
      ...(scale && { scale: initialScale })
    },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      transition: {
        duration,
        delay,
        ease: easeOut
      }
    }
  }

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount: threshold }}
      variants={variants}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ============================================
// 预设变体：淡入上滑
// ============================================

export function RevealUp({ 
  children, 
  delay = 0,
  className 
}: { 
  children: React.ReactNode
  delay?: number
  className?: string 
}) {
  return (
    <ScrollReveal direction="up" delay={delay} className={className}>
      {children}
    </ScrollReveal>
  )
}

// ============================================
// 预设变体：淡入下滑
// ============================================

export function RevealDown({ 
  children, 
  delay = 0,
  className 
}: { 
  children: React.ReactNode
  delay?: number
  className?: string 
}) {
  return (
    <ScrollReveal direction="down" delay={delay} className={className}>
      {children}
    </ScrollReveal>
  )
}

// ============================================
// 预设变体：淡入左滑
// ============================================

export function RevealLeft({ 
  children, 
  delay = 0,
  className 
}: { 
  children: React.ReactNode
  delay?: number
  className?: string 
}) {
  return (
    <ScrollReveal direction="left" delay={delay} className={className}>
      {children}
    </ScrollReveal>
  )
}

// ============================================
// 预设变体：淡入右滑
// ============================================

export function RevealRight({ 
  children, 
  delay = 0,
  className 
}: { 
  children: React.ReactNode
  delay?: number
  className?: string 
}) {
  return (
    <ScrollReveal direction="right" delay={delay} className={className}>
      {children}
    </ScrollReveal>
  )
}

// ============================================
// 预设变体：纯淡入
// ============================================

export function RevealFade({ 
  children, 
  delay = 0,
  className 
}: { 
  children: React.ReactNode
  delay?: number
  className?: string 
}) {
  return (
    <ScrollReveal direction="none" delay={delay} className={className}>
      {children}
    </ScrollReveal>
  )
}

// ============================================
// 预设变体：缩放淡入
// ============================================

export function RevealScale({ 
  children, 
  delay = 0,
  className 
}: { 
  children: React.ReactNode
  delay?: number
  className?: string 
}) {
  return (
    <ScrollReveal 
      direction="none" 
      delay={delay} 
      scale={true}
      initialScale={0.9}
      className={className}
    >
      {children}
    </ScrollReveal>
  )
}

// ============================================
// 交错滚动动画容器
// ============================================

interface ScrollStaggerProps {
  children: React.ReactNode
  className?: string
  /** 子元素之间的延迟（秒） */
  staggerDelay?: number
  /** 初始延迟（秒） */
  initialDelay?: number
  /** 是否只触发一次 */
  once?: boolean
  /** 触发阈值 */
  threshold?: number
}

export function ScrollStagger({ 
  children, 
  className,
  staggerDelay = 0.1,
  initialDelay = 0,
  once = true,
  threshold = 0.1
}: ScrollStaggerProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount: threshold }}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: staggerDelay,
            delayChildren: initialDelay
          }
        }
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ============================================
// 交错滚动动画子项
// ============================================

interface ScrollStaggerItemProps {
  children: React.ReactNode
  className?: string
  direction?: "up" | "down" | "left" | "right" | "none"
  distance?: number
}

export function ScrollStaggerItem({ 
  children, 
  className,
  direction = "up",
  distance = 20
}: ScrollStaggerItemProps) {
  const getInitialPosition = () => {
    switch (direction) {
      case "up": return { y: distance }
      case "down": return { y: -distance }
      case "left": return { x: distance }
      case "right": return { x: -distance }
      case "none": return {}
    }
  }

  return (
    <motion.div
      variants={{
        hidden: { 
          opacity: 0, 
          ...getInitialPosition() 
        },
        visible: { 
          opacity: 1, 
          x: 0, 
          y: 0,
          transition: {
            duration: 0.5,
            ease: easeOut
          }
        }
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ============================================
// 默认导出
// ============================================

export default ScrollReveal
