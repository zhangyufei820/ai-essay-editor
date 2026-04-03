"use client"

import { useEffect, useRef } from "react"

interface MobiusInfinityProps {
  size?: number
  className?: string
}

export function MobiusInfinity({ size = 140, className = "" }: MobiusInfinityProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // 创建动态粒子
    const container = containerRef.current
    const particleCount = 12

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement("div")
      particle.className = "mobius-sparkle"
      particle.style.animationDelay = `${(i / particleCount) * 8}s`
      particle.style.width = `${2 + Math.random() * 2}px`
      particle.style.height = particle.style.width
      container.appendChild(particle)
    }

    return () => {
      if (containerRef.current) {
        const sparkles = containerRef.current.querySelectorAll(".mobius-sparkle")
        sparkles.forEach((s) => s.remove())
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={`mobius-3d ${className}`}
      style={{ width: size, height: size / 2 }}
    >
      {/* 外环 */}
      <div className="mobius-ring-outer" />
      {/* 中环 */}
      <div className="mobius-ring-middle" />
      {/* 内环 */}
      <div className="mobius-ring-inner" />
      {/* 中心光点 */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
        style={{
          background: "linear-gradient(135deg, #2DD4BF 0%, #FBBF24 100%)",
          boxShadow: "0 0 20px rgba(45, 212, 191, 0.6), 0 0 40px rgba(251, 191, 36, 0.3)",
          animation: "pulse 2s ease-in-out infinite"
        }}
      />
    </div>
  )
}
