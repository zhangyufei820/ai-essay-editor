'use client'

import { type LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

// ============================================
// TextEntropy - 文字入场动画
// 文字从模糊光斑聚集，象征知识从混沌到有序
// ============================================

interface TextEntropyProps {
  text: string
  className?: string
  delay?: number
  style?: React.CSSProperties
}

export function TextEntropy({ text, className, delay = 0, style }: TextEntropyProps) {
  const characters = text.split('')
  
  return (
    <span className={cn('inline-block', className)} style={style}>
      {characters.map((char, index) => (
        <motion.span
          key={index}
          initial={{ 
            opacity: 0, 
            filter: 'blur(12px)',
            scale: 0.9
          }}
          animate={{ 
            opacity: 1, 
            filter: 'blur(0px)',
            scale: 1
          }}
          transition={{
            duration: 0.8,
            delay: delay + index * 0.03,
            ease: [0.34, 1.56, 0.64, 1]
          }}
          className="inline-block"
          style={{ 
            display: char === ' ' ? 'inline' : 'inline-block',
            whiteSpace: char === ' ' ? 'pre' : 'normal'
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
    </span>
  )
}

// ============================================
// IconEntropy - 图标入场动画
// 图标从星点扩散，象征智慧之光点亮
// ============================================

interface IconEntropyProps {
  icon: LucideIcon
  size?: number
  color?: string
  delay?: number
  className?: string
}

export function IconEntropy({ icon: Icon, size = 24, color = '#00D4AA', delay = 0, className }: IconEntropyProps) {
  return (
    <motion.div
      initial={{ 
        opacity: 0, 
        scale: 0,
        rotate: -180
      }}
      animate={{ 
        opacity: 1, 
        scale: 1,
        rotate: 0
      }}
      transition={{
        duration: 0.6,
        delay,
        ease: [0.34, 1.56, 0.64, 1]
      }}
      className={cn('flex items-center justify-center', className)}
      style={{
        filter: `drop-shadow(0 0 8px ${color}60)`
      }}
    >
      <Icon 
        size={size} 
        style={{ color }}
      />
    </motion.div>
  )
}

// ============================================
// InfinitySymbol - 无穷大符号
// 用于板块间的呼吸间隙，象征成长与无限
// ============================================

interface InfinitySymbolProps {
  className?: string
  size?: number
}

export function InfinitySymbol({ className, size = 40 }: InfinitySymbolProps) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1, ease: 'easeOut' }}
      className={cn('inline-block infinity-breathe', className)}
      style={{
        fontSize: size,
        background: 'linear-gradient(135deg, #0A2E26 0%, #29986A 50%, #0A2E26 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}
    >
      ∞
    </motion.span>
  )
}

// ============================================
// StarGlow - 星点发光效果
// 用于点缀和装饰
// ============================================

interface StarGlowProps {
  className?: string
  color?: string
  size?: 'sm' | 'md' | 'lg'
}

export function StarGlow({ className, color = '#00D4AA', size = 'md' }: StarGlowProps) {
  const sizes = {
    sm: 4,
    md: 6,
    lg: 8
  }
  
  return (
    <motion.div
      className={cn('rounded-full glow-breathing-green', className)}
      style={{
        width: sizes[size],
        height: sizes[size],
        backgroundColor: color,
        boxShadow: `0 0 ${sizes[size] * 2}px ${color}`
      }}
      whileHover={{ 
        scale: 1.5,
        boxShadow: `0 0 ${sizes[size] * 4}px ${color}`
      }}
    />
  )
}

// ============================================
// BreathingGap - 呼吸间隙
// 板块间的极简过渡
// ============================================

interface BreathingGapProps {
  className?: string
  symbol?: 'infinity' | 'dot' | 'line'
}

export function BreathingGap({ className, symbol = 'infinity' }: BreathingGapProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.5 }}
      className={cn('flex justify-center py-12', className)}
    >
      {symbol === 'infinity' && <InfinitySymbol size={48} />}
      {symbol === 'dot' && (
        <motion.div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: '#00D4AA' }}
          animate={{ 
            scale: [1, 1.5, 1],
            opacity: [0.4, 1, 0.4]
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
      {symbol === 'line' && (
        <motion.div
          className="w-24 h-px"
          style={{ 
            background: 'linear-gradient(90deg, transparent, #00D4AA, transparent)'
          }}
          animate={{ 
            scaleX: [0.8, 1, 0.8],
            opacity: [0.3, 0.6, 0.3]
          }}
          transition={{ duration: 3, repeat: Infinity }}
        />
      )}
    </motion.div>
  )
}

// ============================================
// EntropyAnimation - 统一导出
// ============================================

export const EntropyAnimation = {
  Text: TextEntropy,
  Icon: IconEntropy,
  Infinity: InfinitySymbol,
  Star: StarGlow,
  Gap: BreathingGap
}

export default EntropyAnimation
