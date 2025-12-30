/**
 * 🔢 沈翔学校 - 动画计数器组件 (Animated Counter)
 * 
 * 用于数字统计展示的滚动计数动画。
 */

"use client"

import { useEffect, useRef, useState } from "react"
import { useInView, useMotionValue, useSpring } from "framer-motion"
import { cn } from "@/lib/utils"

// ============================================
// 类型定义
// ============================================

interface AnimatedCounterProps {
  /** 目标数值 */
  value: number
  /** 动画时长（秒） */
  duration?: number
  /** 延迟时间（秒） */
  delay?: number
  /** 前缀（如 ¥、★） */
  prefix?: string
  /** 后缀（如 %、+、万） */
  suffix?: string
  /** 小数位数 */
  decimals?: number
  /** 千位分隔符 */
  separator?: string
  /** 自定义类名 */
  className?: string
  /** 是否只触发一次 */
  once?: boolean
}

// ============================================
// 格式化函数
// ============================================

function formatNumber(num: number, decimals: number, separator: string): string {
  const fixed = num.toFixed(decimals)
  const [integer, decimal] = fixed.split(".")
  
  // 添加千位分隔符
  const withSeparator = integer.replace(/\B(?=(\d{3})+(?!\d))/g, separator)
  
  return decimal ? `${withSeparator}.${decimal}` : withSeparator
}

// ============================================
// 动画计数器组件
// ============================================

export function AnimatedCounter({
  value,
  duration = 2,
  delay = 0,
  prefix = "",
  suffix = "",
  decimals = 0,
  separator = ",",
  className,
  once = true
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once, margin: "-50px" })
  const [hasAnimated, setHasAnimated] = useState(false)

  const motionValue = useMotionValue(0)
  const springValue = useSpring(motionValue, {
    duration: duration * 1000,
    bounce: 0
  })

  const [displayValue, setDisplayValue] = useState(formatNumber(0, decimals, separator))

  // 触发动画
  useEffect(() => {
    if (isInView && !hasAnimated) {
      const timer = setTimeout(() => {
        motionValue.set(value)
        setHasAnimated(true)
      }, delay * 1000)

      return () => clearTimeout(timer)
    }
  }, [isInView, hasAnimated, value, delay, motionValue])

  // 监听数值变化
  useEffect(() => {
    const unsubscribe = springValue.on("change", (latest) => {
      const formatted = formatNumber(latest, decimals, separator)
      setDisplayValue(formatted)
    })

    return () => unsubscribe()
  }, [springValue, decimals, separator])

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {prefix}{displayValue}{suffix}
    </span>
  )
}

// ============================================
// 预设变体：百分比
// ============================================

export function AnimatedPercent({
  value,
  duration = 1.5,
  delay = 0,
  decimals = 0,
  className
}: Omit<AnimatedCounterProps, 'suffix' | 'separator'>) {
  return (
    <AnimatedCounter
      value={value}
      duration={duration}
      delay={delay}
      decimals={decimals}
      suffix="%"
      separator=""
      className={className}
    />
  )
}

// ============================================
// 预设变体：金额
// ============================================

export function AnimatedCurrency({
  value,
  duration = 2,
  delay = 0,
  decimals = 0,
  currency = "¥",
  className
}: Omit<AnimatedCounterProps, 'prefix'> & { currency?: string }) {
  return (
    <AnimatedCounter
      value={value}
      duration={duration}
      delay={delay}
      decimals={decimals}
      prefix={currency}
      className={className}
    />
  )
}

// ============================================
// 预设变体：评分
// ============================================

export function AnimatedRating({
  value,
  duration = 1.5,
  delay = 0,
  className
}: Omit<AnimatedCounterProps, 'prefix' | 'decimals'>) {
  return (
    <AnimatedCounter
      value={value}
      duration={duration}
      delay={delay}
      decimals={1}
      prefix="★ "
      separator=""
      className={className}
    />
  )
}

// ============================================
// 预设变体：大数字（万/亿）
// ============================================

interface AnimatedLargeNumberProps {
  value: number
  duration?: number
  delay?: number
  className?: string
}

export function AnimatedLargeNumber({
  value,
  duration = 2,
  delay = 0,
  className
}: AnimatedLargeNumberProps) {
  // 自动转换为万/亿
  let displayValue = value
  let suffix = ""

  if (value >= 100000000) {
    displayValue = value / 100000000
    suffix = "亿+"
  } else if (value >= 10000) {
    displayValue = value / 10000
    suffix = "万+"
  } else if (value >= 1000) {
    suffix = "+"
  }

  const decimals = displayValue % 1 !== 0 ? 1 : 0

  return (
    <AnimatedCounter
      value={displayValue}
      duration={duration}
      delay={delay}
      decimals={decimals}
      suffix={suffix}
      separator=","
      className={className}
    />
  )
}

// ============================================
// 统计卡片组件
// ============================================

interface StatCardProps {
  value: number
  label: string
  suffix?: string
  prefix?: string
  delay?: number
  className?: string
}

export function StatCard({
  value,
  label,
  suffix = "",
  prefix = "",
  delay = 0,
  className
}: StatCardProps) {
  return (
    <div className={cn("text-center", className)}>
      <div className="text-4xl md:text-5xl font-bold">
        <AnimatedCounter
          value={value}
          suffix={suffix}
          prefix={prefix}
          delay={delay}
          duration={2}
        />
      </div>
      <p className="text-sm md:text-base opacity-80 mt-2">{label}</p>
    </div>
  )
}

// ============================================
// 默认导出
// ============================================

export default AnimatedCounter
