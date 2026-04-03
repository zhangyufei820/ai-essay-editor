'use client'

import { forwardRef, ButtonHTMLAttributes, useState, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'inspiration' | 'gold'
  size?: 'sm' | 'md' | 'lg'
}

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant = 'default', size = 'md', children, ...props }, ref) => {
    const [magneticOffset, setMagneticOffset] = useState({ x: 0, y: 0 })
    const buttonRef = useRef<HTMLButtonElement>(null)

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      if (!buttonRef.current) return
      const rect = buttonRef.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const distX = e.clientX - centerX
      const distY = e.clientY - centerY
      const distance = Math.sqrt(distX * distX + distY * distY)
      const maxDistance = 100

      if (distance < maxDistance) {
        const strength = (1 - distance / maxDistance) * 0.3
        setMagneticOffset({
          x: distX * strength,
          y: distY * strength,
        })
      }
    }, [])

    const handleMouseLeave = useCallback(() => {
      setMagneticOffset({ x: 0, y: 0 })
    }, [])

    const baseStyles = cn(
      'relative overflow-hidden rounded-xl font-medium transition-all duration-300',
      'backdrop-blur-md border',
      'hover:shadow-[0_0_30px_rgba(0,212,170,0.3)]',
      'active:scale-[0.98]',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      {
        'px-4 py-2 text-sm': size === 'sm',
        'px-6 py-3 text-base': size === 'md',
        'px-8 py-4 text-lg': size === 'lg',
      }
    )

    const variantStyles = {
      default: 'bg-[#00D4AA]/20 hover:bg-[#00D4AA]/30 hover:border-[#00D4AA]/50 border-[#00D4AA]/30 text-[#00D4AA]',
      outline: 'bg-transparent hover:bg-[#00D4AA]/10 border-[#00D4AA]/50 text-[#00D4AA]',
      ghost: 'bg-transparent hover:bg-[#00D4AA]/10 border-transparent text-[#00D4AA]',
      inspiration: 'bg-[#FF8C42]/20 hover:bg-[#FF8C42]/30 hover:border-[#FF8C42]/50 border-[#FF8C42]/30 text-[#FF8C42] hover:shadow-[0_0_30px_rgba(255,140,66,0.3)]',
      gold: 'bg-[#F59E0B]/20 hover:bg-[#F59E0B]/30 hover:border-[#F59E0B]/50 border-[#F59E0B]/30 text-[#F59E0B] hover:shadow-[0_0_30px_rgba(245,158,11,0.3)] gold-edge',
    }

    return (
      <button
        ref={(node) => {
          if (typeof ref === 'function') {
            ref(node)
          } else if (ref) {
            ref.current = node
          }
          ;(buttonRef as React.MutableRefObject<HTMLButtonElement | null>).current = node
        }}
        className={cn(baseStyles, variantStyles[variant], className)}
        style={{
          transform: `translate(${magneticOffset.x}px, ${magneticOffset.y}px)`,
          transition: magneticOffset.x !== 0 || magneticOffset.y !== 0
            ? 'transform 0.1s ease-out'
            : 'all 0.3s ease',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        {/* Shimmer effect */}
        <span
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer pointer-events-none"
          aria-hidden="true"
        />
        {children}
      </button>
    )
  }
)

GlassButton.displayName = 'GlassButton'
