"use client"

import { motion, useReducedMotion } from "framer-motion"
import type { CSSProperties, ReactNode } from "react"

interface FadeInProps {
  children?: ReactNode
  className?: string
  delay?: number
  style?: CSSProperties
  y?: number
}

export function FadeIn({ children, className, delay = 0, style, y = 20 }: FadeInProps) {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return <div className={className} style={style}>{children}</div>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay, ease: [0.33, 1, 0.68, 1] }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}
