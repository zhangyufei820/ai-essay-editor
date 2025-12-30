/**
 * 🎯 沈翔学校 - 动画按钮组件 (Animated Button)
 * 
 * 带有丰富微交互的按钮组件。
 */

"use client"

import { forwardRef, useState, useEffect } from "react"
import { motion, type HTMLMotionProps } from "framer-motion"
import { Loader2, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { brandColors } from "@/lib/design-tokens"

// ============================================
// 类型定义
// ============================================

interface AnimatedButtonProps extends Omit<HTMLMotionProps<"button">, "size"> {
  /** 按钮变体 */
  variant?: "primary" | "secondary" | "ghost" | "glow" | "outline"
  /** 按钮尺寸 */
  size?: "sm" | "md" | "lg" | "xl"
  /** 加载状态 */
  loading?: boolean
  /** 成功状态 */
  success?: boolean
  /** 左侧图标 */
  leftIcon?: React.ReactNode
  /** 右侧图标 */
  rightIcon?: React.ReactNode
  /** 按钮内容 */
  children: React.ReactNode
  /** 是否全宽 */
  fullWidth?: boolean
}

// ============================================
// 样式配置
// ============================================

const sizeStyles = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-base gap-2.5 rounded-xl",
  xl: "h-14 px-8 text-lg gap-3 rounded-2xl"
}

const variantStyles = {
  primary: cn(
    "bg-brand-900 text-white",
    "hover:bg-brand-800",
    "shadow-md hover:shadow-lg",
    "shadow-brand-900/20 hover:shadow-brand-900/30"
  ),
  secondary: cn(
    "bg-white text-brand-900",
    "border border-brand-200",
    "hover:border-brand-300 hover:bg-brand-50"
  ),
  ghost: cn(
    "bg-transparent text-slate-600",
    "hover:text-slate-900 hover:bg-slate-100"
  ),
  outline: cn(
    "bg-transparent text-brand-900",
    "border-2 border-brand-900",
    "hover:bg-brand-900 hover:text-white"
  ),
  glow: cn(
    "bg-brand-900 text-white",
    "shadow-lg shadow-brand-900/25"
  )
}

// ============================================
// 动画按钮组件
// ============================================

export const AnimatedButton = forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  function AnimatedButton(
    {
      variant = "primary",
      size = "md",
      loading = false,
      success = false,
      leftIcon,
      rightIcon,
      children,
      className,
      disabled,
      fullWidth = false,
      ...props
    },
    ref
  ) {
    const [showSuccess, setShowSuccess] = useState(false)

    // 成功状态自动恢复
    useEffect(() => {
      if (success) {
        setShowSuccess(true)
        const timer = setTimeout(() => setShowSuccess(false), 1500)
        return () => clearTimeout(timer)
      }
    }, [success])

    const isDisabled = disabled || loading

    return (
      <motion.button
        ref={ref}
        whileHover={isDisabled ? {} : { y: -2, scale: 1.01 }}
        whileTap={isDisabled ? {} : { scale: 0.98, y: 0 }}
        transition={{ 
          duration: 0.2, 
          ease: [0.33, 1, 0.68, 1] 
        }}
        disabled={isDisabled}
        className={cn(
          "relative inline-flex items-center justify-center font-medium",
          "transition-colors duration-200",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          sizeStyles[size],
          variantStyles[variant],
          fullWidth && "w-full",
          className
        )}
        {...props}
      >
        {/* 发光效果 - 仅 glow 变体 */}
        {variant === "glow" && !isDisabled && (
          <motion.span
            className="absolute inset-0 rounded-xl"
            style={{ backgroundColor: brandColors[500] }}
            animate={{
              opacity: [0, 0.15, 0],
              scale: [1, 1.05, 1]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        )}

        {/* 成功状态背景 */}
        {showSuccess && (
          <motion.span
            className="absolute inset-0 rounded-xl bg-green-500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}

        {/* 内容容器 */}
        <span className="relative flex items-center justify-center gap-2">
          {/* 加载状态 */}
          {loading && (
            <Loader2 className="w-4 h-4 animate-spin" />
          )}

          {/* 成功状态 */}
          {showSuccess && !loading && (
            <motion.span
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <Check className="w-5 h-5" />
            </motion.span>
          )}

          {/* 左侧图标 */}
          {!loading && !showSuccess && leftIcon && (
            <span className="shrink-0">{leftIcon}</span>
          )}

          {/* 文字内容 */}
          {!showSuccess && (
            <span className={cn(loading && "opacity-70")}>
              {children}
            </span>
          )}

          {/* 右侧图标 */}
          {!loading && !showSuccess && rightIcon && (
            <motion.span 
              className="shrink-0"
              whileHover={{ x: 2 }}
              transition={{ duration: 0.2 }}
            >
              {rightIcon}
            </motion.span>
          )}
        </span>
      </motion.button>
    )
  }
)

// ============================================
// 预设变体：主要 CTA
// ============================================

export function PrimaryButton({
  children,
  ...props
}: Omit<AnimatedButtonProps, 'variant'>) {
  return (
    <AnimatedButton variant="primary" {...props}>
      {children}
    </AnimatedButton>
  )
}

// ============================================
// 预设变体：发光 CTA
// ============================================

export function GlowButton({
  children,
  size = "lg",
  ...props
}: Omit<AnimatedButtonProps, 'variant'>) {
  return (
    <AnimatedButton variant="glow" size={size} {...props}>
      {children}
    </AnimatedButton>
  )
}

// ============================================
// 预设变体：次要按钮
// ============================================

export function SecondaryButton({
  children,
  ...props
}: Omit<AnimatedButtonProps, 'variant'>) {
  return (
    <AnimatedButton variant="secondary" {...props}>
      {children}
    </AnimatedButton>
  )
}

// ============================================
// 预设变体：幽灵按钮
// ============================================

export function GhostButton({
  children,
  ...props
}: Omit<AnimatedButtonProps, 'variant'>) {
  return (
    <AnimatedButton variant="ghost" {...props}>
      {children}
    </AnimatedButton>
  )
}

// ============================================
// 预设变体：轮廓按钮
// ============================================

export function OutlineButton({
  children,
  ...props
}: Omit<AnimatedButtonProps, 'variant'>) {
  return (
    <AnimatedButton variant="outline" {...props}>
      {children}
    </AnimatedButton>
  )
}

// ============================================
// 图标按钮
// ============================================

interface IconButtonProps extends Omit<AnimatedButtonProps, 'leftIcon' | 'rightIcon' | 'children'> {
  icon: React.ReactNode
  "aria-label": string
}

export function IconButton({
  icon,
  size = "md",
  className,
  ...props
}: IconButtonProps) {
  const iconSizeStyles = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
    xl: "h-14 w-14"
  }

  return (
    <AnimatedButton
      size={size}
      className={cn(iconSizeStyles[size], "px-0", className)}
      {...props}
    >
      {icon}
    </AnimatedButton>
  )
}

// ============================================
// 默认导出
// ============================================

export default AnimatedButton
