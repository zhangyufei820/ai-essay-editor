"use client"

import { Children, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"

interface StaggerProps {
  children: ReactNode
  className?: string
  delay?: number
}

export function Stagger({ children, className, delay = 0.1 }: StaggerProps) {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={{
        hidden: { opacity: 1 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.1, delayChildren: delay },
        },
      }}
      className={className}
    >
      {Children.map(children, (child) => (
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: {
              opacity: 1,
              y: 0,
              transition: { duration: 0.5, ease: [0.33, 1, 0.68, 1] },
            },
          }}
          className="h-full"
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  )
}
