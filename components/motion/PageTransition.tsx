/**
 * 🎬 沈翔学校 - 页面过渡动画组件 (Page Transition)
 * 
 * 页面级别的过渡动画包装器，提供优雅的进入/退出效果。
 */

"use client"

import { motion, type Easing } from "framer-motion"
import { cn } from "@/lib/utils"

// ============================================
// 类型定义
// ============================================

interface PageTransitionProps {
  children: React.ReactNode
  className?: string
  /** 动画方向 */
  direction?: "up" | "down" | "left" | "right" | "fade"
  /** 动画时长（毫秒） */
  duration?: number
  /** 延迟时间（毫秒） */
  delay?: number
}

// ============================================
// 缓动函数
// ============================================

const easeOut: Easing = [0.33, 1, 0.68, 1]
const easeInOut: Easing = [0.65, 0, 0.35, 1]

// ============================================
// 动画变体配置
// ============================================

const getVariants = (direction: string, duration: number, delay: number) => {
  const offset = 12

  const directionMap = {
    up: { y: offset },
    down: { y: -offset },
    left: { x: offset },
    right: { x: -offset },
    fade: {}
  }

  const exitMap = {
    up: { y: -offset },
    down: { y: offset },
    left: { x: -offset },
    right: { x: offset },
    fade: {}
  }

  return {
    initial: {
      opacity: 0,
      ...directionMap[direction as keyof typeof directionMap]
    },
    animate: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: {
        duration: duration / 1000,
        delay: delay / 1000,
        ease: easeOut
      }
    },
    exit: {
      opacity: 0,
      ...exitMap[direction as keyof typeof exitMap],
      transition: {
        duration: (duration * 0.75) / 1000,
        ease: easeInOut
      }
    }
  }
}

// ============================================
// 页面过渡组件
// ============================================

export function PageTransition({ 
  children, 
  className,
  direction = "up",
  duration = 400,
  delay = 0
}: PageTransitionProps) {
  const variants = getVariants(direction, duration, delay)

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      className={cn("w-full", className)}
    >
      {children}
    </motion.div>
  )
}

// ============================================
// 预设变体：淡入
// ============================================

export function FadeIn({ 
  children, 
  className,
  duration = 300,
  delay = 0
}: Omit<PageTransitionProps, 'direction'>) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ 
        opacity: 1,
        transition: {
          duration: duration / 1000,
          delay: delay / 1000,
          ease: easeOut
        }
      }}
      className={cn("w-full", className)}
    >
      {children}
    </motion.div>
  )
}

// ============================================
// 预设变体：滑入
// ============================================

export function SlideIn({ 
  children, 
  className,
  direction = "up",
  duration = 400,
  delay = 0
}: PageTransitionProps) {
  return (
    <PageTransition
      direction={direction}
      duration={duration}
      delay={delay}
      className={className}
    >
      {children}
    </PageTransition>
  )
}

// ============================================
// 预设变体：缩放进入
// ============================================

export function ScaleIn({ 
  children, 
  className,
  duration = 300,
  delay = 0
}: Omit<PageTransitionProps, 'direction'>) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ 
        opacity: 1, 
        scale: 1,
        transition: {
          duration: duration / 1000,
          delay: delay / 1000,
          ease: easeOut
        }
      }}
      className={cn("w-full", className)}
    >
      {children}
    </motion.div>
  )
}

// ============================================
// 交错动画容器
// ============================================

interface StaggerContainerProps {
  children: React.ReactNode
  className?: string
  /** 子元素之间的延迟（毫秒） */
  staggerDelay?: number
  /** 初始延迟（毫秒） */
  initialDelay?: number
}

export function StaggerContainer({ 
  children, 
  className,
  staggerDelay = 50,
  initialDelay = 0
}: StaggerContainerProps) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={{
        initial: {},
        animate: {
          transition: {
            staggerChildren: staggerDelay / 1000,
            delayChildren: initialDelay / 1000
          }
        }
      }}
      className={cn("w-full", className)}
    >
      {children}
    </motion.div>
  )
}

// ============================================
// 交错动画子项
// ============================================

interface StaggerItemProps {
  children: React.ReactNode
  className?: string
}

export function StaggerItem({ children, className }: StaggerItemProps) {
  return (
    <motion.div
      variants={{
        initial: { opacity: 0, y: 10 },
        animate: { 
          opacity: 1, 
          y: 0,
          transition: {
            duration: 0.4,
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

export default PageTransition
