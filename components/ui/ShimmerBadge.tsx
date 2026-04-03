'use client'

import { forwardRef, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface ShimmerBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error'
}

export const ShimmerBadge = forwardRef<HTMLSpanElement, ShimmerBadgeProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const variantStyles = {
      default: 'bg-[#00D4AA]/20 text-[#00D4AA] border-[#00D4AA]/30',
      success: 'bg-green-500/20 text-green-400 border-green-500/30',
      warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      error: 'bg-red-500/20 text-red-400 border-red-500/30',
    }

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium',
          'border backdrop-blur-sm',
          'relative overflow-hidden',
          'before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent before:-translate-x-full before:animate-shimmer',
          variantStyles[variant],
          className
        )}
        {...props}
      >
        {children}
      </span>
    )
  }
)

ShimmerBadge.displayName = 'ShimmerBadge'
