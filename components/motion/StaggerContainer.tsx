/**
 * 🎭 沈翔学校 - 交错动画容器组件 (Stagger Container)
 * 
 * 用于创建子元素依次入场动画的容器。
 */

"use client"

import { createContext, useContext } from "react"
import { motion, type Variants, type Easing } from "framer-motion"
import { cn } from "@/lib/utils"

// ============================================
// 类型定义
// ============================================

interface StaggerContainerProps {
  children: React.ReactNode
  /** 子元素之间的延迟（秒） */
  staggerDelay?: number
  /** 初始延迟（秒） */
  initialDelay?: number
  /** 是否只触发一次 */
  once?: boolean
  /** 触发阈值 */
  threshold?: number
  /** 自定义类名 */
  className?: string
  /** 是否使用 whileInView（滚动触发） */
  useInView?: boolean
}

interface StaggerItemProps {
  children: React.ReactNode
  className?: string
  /** 动画方向 */
  direction?: "up" | "down" | "left" | "right" | "none"
  /** 位移距离 */
  distance?: number
  /** 是否包含缩放 */
  scale?: boolean
}

// ============================================
// Context
// ============================================

const StaggerContext = createContext<boolean>(false)

// ============================================
// 缓动函数
// ============================================

const easeOut: Easing = [0.33, 1, 0.68, 1]

// ============================================
// 交错动画容器
// ============================================

export function StaggerContainer({
  children,
  staggerDelay = 0.1,
  initialDelay = 0,
  once = true,
  threshold = 0.1,
  className,
  useInView = true
}: StaggerContainerProps) {
  const containerVariants: Variants = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: initialDelay,
        staggerChildren: staggerDelay
      }
    }
  }

  if (useInView) {
    return (
      <StaggerContext.Provider value={true}>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once, amount: threshold }}
          variants={containerVariants}
          className={className}
        >
          {children}
        </motion.div>
      </StaggerContext.Provider>
    )
  }

  return (
    <StaggerContext.Provider value={true}>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className={className}
      >
        {children}
      </motion.div>
    </StaggerContext.Provider>
  )
}

// ============================================
// 交错动画子项
// ============================================

export function StaggerItem({ 
  children, 
  className,
  direction = "up",
  distance = 20,
  scale = false
}: StaggerItemProps) {
  const isInStaggerContext = useContext(StaggerContext)

  // 根据方向获取初始位置
  const getInitialPosition = () => {
    switch (direction) {
      case "up": return { y: distance }
      case "down": return { y: -distance }
      case "left": return { x: distance }
      case "right": return { x: -distance }
      case "none": return {}
    }
  }

  const itemVariants: Variants = {
    hidden: { 
      opacity: 0, 
      ...getInitialPosition(),
      ...(scale && { scale: 0.95 })
    },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.5,
        ease: easeOut
      }
    }
  }

  // 如果不在 StaggerContainer 内，直接渲染
  if (!isInStaggerContext) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  )
}

// ============================================
// 预设变体：网格交错
// ============================================

interface StaggerGridProps {
  children: React.ReactNode
  columns?: number
  gap?: number
  staggerDelay?: number
  className?: string
}

export function StaggerGrid({
  children,
  columns = 3,
  gap = 6,
  staggerDelay = 0.08,
  className
}: StaggerGridProps) {
  return (
    <StaggerContainer 
      staggerDelay={staggerDelay}
      className={cn(
        "grid",
        `grid-cols-1 md:grid-cols-2 lg:grid-cols-${columns}`,
        `gap-${gap}`,
        className
      )}
    >
      {children}
    </StaggerContainer>
  )
}

// ============================================
// 预设变体：列表交错
// ============================================

interface StaggerListProps {
  children: React.ReactNode
  staggerDelay?: number
  className?: string
}

export function StaggerList({
  children,
  staggerDelay = 0.05,
  className
}: StaggerListProps) {
  return (
    <StaggerContainer 
      staggerDelay={staggerDelay}
      className={cn("flex flex-col", className)}
    >
      {children}
    </StaggerContainer>
  )
}

// ============================================
// 预设变体：水平交错
// ============================================

interface StaggerRowProps {
  children: React.ReactNode
  staggerDelay?: number
  gap?: number
  className?: string
}

export function StaggerRow({
  children,
  staggerDelay = 0.1,
  gap = 4,
  className
}: StaggerRowProps) {
  return (
    <StaggerContainer 
      staggerDelay={staggerDelay}
      className={cn("flex flex-row items-center", `gap-${gap}`, className)}
    >
      {children}
    </StaggerContainer>
  )
}

// ============================================
// 快捷子项变体
// ============================================

export function StaggerItemUp({ children, className }: { children: React.ReactNode; className?: string }) {
  return <StaggerItem direction="up" className={className}>{children}</StaggerItem>
}

export function StaggerItemDown({ children, className }: { children: React.ReactNode; className?: string }) {
  return <StaggerItem direction="down" className={className}>{children}</StaggerItem>
}

export function StaggerItemLeft({ children, className }: { children: React.ReactNode; className?: string }) {
  return <StaggerItem direction="left" className={className}>{children}</StaggerItem>
}

export function StaggerItemRight({ children, className }: { children: React.ReactNode; className?: string }) {
  return <StaggerItem direction="right" className={className}>{children}</StaggerItem>
}

export function StaggerItemFade({ children, className }: { children: React.ReactNode; className?: string }) {
  return <StaggerItem direction="none" className={className}>{children}</StaggerItem>
}

export function StaggerItemScale({ children, className }: { children: React.ReactNode; className?: string }) {
  return <StaggerItem direction="none" scale={true} className={className}>{children}</StaggerItem>
}

// ============================================
// 默认导出
// ============================================

export default StaggerContainer
