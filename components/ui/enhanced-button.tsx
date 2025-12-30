/**
 * 🎨 沈翔学校 - 增强按钮组件 (Enhanced Button)
 * 
 * 基于 shadcn/ui Button 扩展，添加品牌样式和动效。
 */

"use client"

import * as React from "react"
import { forwardRef } from "react"
import { motion, HTMLMotionProps } from "framer-motion"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonHover } from "@/lib/motion"
import { brandColors } from "@/lib/design-tokens"

// ============================================
// 按钮变体样式
// ============================================

const enhancedButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-[3px]",
  {
    variants: {
      variant: {
        // 原有变体
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        
        // 品牌变体
        brand: "bg-[#14532d] text-white hover:bg-[#166534] focus-visible:ring-[#14532d]/20 shadow-[0_4px_16px_rgba(20,83,45,0.3)]",
        "brand-outline": "border-2 border-[#14532d] text-[#14532d] bg-transparent hover:bg-[#14532d]/5 focus-visible:ring-[#14532d]/20",
        "brand-ghost": "text-[#14532d] hover:bg-[#14532d]/10 focus-visible:ring-[#14532d]/20",
        "brand-glow": "bg-[#14532d] text-white hover:bg-[#166534] shadow-[0_0_20px_rgba(20,83,45,0.4),0_4px_16px_rgba(20,83,45,0.3)] hover:shadow-[0_0_30px_rgba(20,83,45,0.5),0_6px_20px_rgba(20,83,45,0.4)] focus-visible:ring-[#14532d]/20",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        xl: "h-12 rounded-lg px-8 text-base has-[>svg]:px-6",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// ============================================
// 类型定义
// ============================================

export interface EnhancedButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onAnimationStart" | "onDrag" | "onDragEnd" | "onDragStart">,
    VariantProps<typeof enhancedButtonVariants> {
  /** 是否作为子组件渲染 */
  asChild?: boolean
  /** 加载状态 */
  loading?: boolean
  /** 左侧图标 */
  leftIcon?: React.ReactNode
  /** 右侧图标 */
  rightIcon?: React.ReactNode
  /** 是否启用动效 */
  animated?: boolean
}

// ============================================
// 动效配置
// ============================================

const motionVariants = {
  rest: { 
    scale: 1, 
    y: 0,
  },
  hover: { 
    scale: 1.02, 
    y: -2,
    transition: { 
      duration: 0.15,
      ease: [0.33, 1, 0.68, 1]
    }
  },
  tap: { 
    scale: 0.98,
    y: 0,
    transition: { 
      duration: 0.1 
    }
  },
}

// ============================================
// 加载动画组件
// ============================================

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <Loader2 
      className={cn("animate-spin", className)} 
      style={{ color: "currentColor" }}
    />
  )
}

// ============================================
// 增强按钮组件
// ============================================

const EnhancedButton = forwardRef<HTMLButtonElement, EnhancedButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      leftIcon,
      rightIcon,
      animated = true,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading

    // 按钮内容
    const buttonContent = (
      <>
        {loading ? (
          <LoadingSpinner className="size-4" />
        ) : leftIcon ? (
          <span className="shrink-0">{leftIcon}</span>
        ) : null}
        
        {children && (
          <span className={cn(loading && "opacity-0 invisible")}>
            {children}
          </span>
        )}
        
        {loading && children && (
          <span className="absolute inset-0 flex items-center justify-center">
            <LoadingSpinner className="size-4" />
          </span>
        )}
        
        {rightIcon && !loading && (
          <span className="shrink-0">{rightIcon}</span>
        )}
      </>
    )

    // 如果是 asChild 模式，使用 Slot
    if (asChild) {
      return (
        <Slot
          ref={ref}
          className={cn(enhancedButtonVariants({ variant, size, className }))}
          {...props}
        >
          {children}
        </Slot>
      )
    }

    // 如果启用动效
    if (animated && !isDisabled) {
      return (
        <motion.button
          ref={ref}
          className={cn(
            enhancedButtonVariants({ variant, size, className }),
            "relative"
          )}
          disabled={isDisabled}
          variants={motionVariants}
          initial="rest"
          whileHover="hover"
          whileTap="tap"
          {...(props as any)}
        >
          {buttonContent}
        </motion.button>
      )
    }

    // 默认无动效按钮
    return (
      <button
        ref={ref}
        className={cn(
          enhancedButtonVariants({ variant, size, className }),
          "relative"
        )}
        disabled={isDisabled}
        {...props}
      >
        {buttonContent}
      </button>
    )
  }
)

EnhancedButton.displayName = "EnhancedButton"

export { EnhancedButton, enhancedButtonVariants }
export default EnhancedButton
