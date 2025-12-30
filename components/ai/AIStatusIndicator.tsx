/**
 * 🤖 沈翔学校 - AI 状态指示器 (AI Status Indicator)
 * 
 * 专属的 AI 状态指示器，替代普通的加载动画。
 */

"use client"

import { motion, AnimatePresence, type Easing } from "framer-motion"
import { Check, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { brandColors, slateColors } from "@/lib/design-tokens"

// ============================================
// 类型定义
// ============================================

interface AIStatusIndicatorProps {
  /** 状态：idle | thinking | responding | complete | error */
  status: "idle" | "thinking" | "responding" | "complete" | "error"
  /** 尺寸：sm | md | lg */
  size?: "sm" | "md" | "lg"
  /** 是否显示文字 */
  showText?: boolean
  /** 自定义类名 */
  className?: string
}

// ============================================
// 尺寸映射
// ============================================

const sizeMap = {
  sm: { container: 24, dot: 4, gap: 3, text: 12 },
  md: { container: 32, dot: 6, gap: 4, text: 13 },
  lg: { container: 48, dot: 8, gap: 5, text: 14 },
} as const

// ============================================
// 状态文字映射
// ============================================

const statusTextMap = {
  idle: "",
  thinking: "思考中...",
  responding: "正在回复...",
  complete: "完成",
  error: "出错了",
} as const

// ============================================
// 思考中动画 - 三个波浪圆点
// ============================================

function ThinkingDots({ dotSize, gap }: { dotSize: number; gap: number }) {
  return (
    <div className="flex items-center" style={{ gap: `${gap}px` }}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={{
            y: [-2, 2, -2],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            ease: [0.45, 0, 0.55, 1] as Easing,
            delay: i * 0.15,
          }}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${brandColors[900]} 0%, ${brandColors[600]} 100%)`,
          }}
        />
      ))}
    </div>
  )
}

// ============================================
// 回复中动画 - 脉冲扩散
// ============================================

function RespondingPulse({ containerSize }: { containerSize: number }) {
  const size = containerSize * 0.4

  return (
    <div 
      className="relative flex items-center justify-center"
      style={{ width: containerSize, height: containerSize }}
    >
      {/* 扩散圆环 1 */}
      <motion.div
        animate={{
          scale: [0.5, 1.2],
          opacity: [0.8, 0],
        }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          ease: [0.33, 1, 0.68, 1] as Easing,
        }}
        className="absolute"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: `2px solid ${brandColors[600]}`,
        }}
      />
      
      {/* 扩散圆环 2 */}
      <motion.div
        animate={{
          scale: [0.5, 1.2],
          opacity: [0.8, 0],
        }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          ease: [0.33, 1, 0.68, 1] as Easing,
          delay: 0.4,
        }}
        className="absolute"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: `2px solid ${brandColors[600]}`,
        }}
      />
      
      {/* 中心圆点 */}
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 0.6,
          repeat: Infinity,
          ease: [0.45, 0, 0.55, 1] as Easing,
        }}
        style={{
          width: size * 0.5,
          height: size * 0.5,
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${brandColors[900]} 0%, ${brandColors[600]} 100%)`,
        }}
      />
    </div>
  )
}

// ============================================
// 空闲状态 - 静态图标
// ============================================

function IdleIndicator({ containerSize }: { containerSize: number }) {
  const size = containerSize * 0.5

  return (
    <div 
      className="flex items-center justify-center"
      style={{ width: containerSize, height: containerSize }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: brandColors[200],
          opacity: 0.6,
        }}
      />
    </div>
  )
}

// ============================================
// 完成状态 - 勾选图标
// ============================================

function CompleteIndicator({ containerSize }: { containerSize: number }) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
      className="flex items-center justify-center"
      style={{ 
        width: containerSize, 
        height: containerSize,
        borderRadius: "50%",
        background: brandColors[100],
      }}
    >
      <Check 
        style={{ 
          width: containerSize * 0.5, 
          height: containerSize * 0.5,
          color: brandColors[700],
        }} 
      />
    </motion.div>
  )
}

// ============================================
// 错误状态 - 警告图标
// ============================================

function ErrorIndicator({ containerSize }: { containerSize: number }) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
      className="flex items-center justify-center"
      style={{ 
        width: containerSize, 
        height: containerSize,
        borderRadius: "50%",
        background: "#fef2f2",
      }}
    >
      <AlertCircle 
        style={{ 
          width: containerSize * 0.5, 
          height: containerSize * 0.5,
          color: "#ef4444",
        }} 
      />
    </motion.div>
  )
}

// ============================================
// AI 状态指示器主组件
// ============================================

export function AIStatusIndicator({
  status,
  size = "md",
  showText = false,
  className,
}: AIStatusIndicatorProps) {
  const dimensions = sizeMap[size]
  const text = statusTextMap[status]

  const renderIndicator = () => {
    switch (status) {
      case "idle":
        return <IdleIndicator containerSize={dimensions.container} />
      case "thinking":
        return <ThinkingDots dotSize={dimensions.dot} gap={dimensions.gap} />
      case "responding":
        return <RespondingPulse containerSize={dimensions.container} />
      case "complete":
        return <CompleteIndicator containerSize={dimensions.container} />
      case "error":
        return <ErrorIndicator containerSize={dimensions.container} />
      default:
        return null
    }
  }

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <AnimatePresence mode="wait">
        <motion.div
          key={status}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.2 }}
          className="flex items-center justify-center"
          style={{ 
            minWidth: dimensions.container, 
            minHeight: dimensions.container 
          }}
        >
          {renderIndicator()}
        </motion.div>
      </AnimatePresence>
      
      {showText && text && (
        <motion.span
          initial={{ opacity: 0, x: -5 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, delay: 0.1 }}
          style={{
            fontSize: `${dimensions.text}px`,
            color: status === "error" ? "#ef4444" : slateColors[500],
          }}
        >
          {text}
        </motion.span>
      )}
    </div>
  )
}

export default AIStatusIndicator
