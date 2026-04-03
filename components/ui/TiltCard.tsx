"use client"

import { useRef, useState, useCallback, ReactNode } from "react"
import { cn } from "@/lib/utils"

interface TiltCardProps {
  children: ReactNode
  className?: string
  tiltIntensity?: number
  iconClassName?: string
}

export function TiltCard({
  children,
  className = "",
  tiltIntensity = 15,
  iconClassName = ""
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return

    const card = cardRef.current
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const rotateX = ((y - centerY) / centerY) * -tiltIntensity
    const rotateY = ((x - centerX) / centerX) * tiltIntensity

    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`
  }, [tiltIntensity])

  const handleMouseLeave = useCallback(() => {
    if (!cardRef.current) return
    cardRef.current.style.transform = "perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)"
    setIsHovered(false)
  }, [])

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true)
  }, [])

  return (
    <div
      ref={cardRef}
      className={cn(
        "tilt-card relative rounded-3xl p-6 transition-shadow duration-300",
        "bg-white/60 backdrop-blur-xl",
        "border border-white/20",
        isHovered
          ? "shadow-2xl"
          : "shadow-lg",
        className
      )}
      style={{
        boxShadow: isHovered
          ? `0 25px 50px -12px rgba(0, 95, 63, 0.15), 0 0 0 1px rgba(45, 212, 191, 0.1)`
          : `0 8px 32px rgba(0, 95, 63, 0.08)`,
        transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease"
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
    >
      {/* 光晕效果 */}
      {isHovered && (
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{
            background: "radial-gradient(circle at 50% 50%, rgba(45, 212, 191, 0.05) 0%, transparent 70%)"
          }}
        />
      )}
      {children}
    </div>
  )
}

// 图标容器 - 比卡片移动更多，产生视差深度感
export function TiltIcon({ children, className = "" }: { children: ReactNode; className?: string }) {
  const iconRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current || !iconRef.current) return

    const card = cardRef.current
    const icon = iconRef.current
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    // 图标移动幅度是卡片的 1.5 倍
    const iconMoveX = ((x - centerX) / centerX) * 25
    const iconMoveY = ((y - centerY) / centerY) * 25

    icon.style.transform = `translate(${iconMoveX}px, ${iconMoveY}px) translateZ(40px)`
  }, [])

  return (
    <div
      ref={(el) => { if (el) cardRef.current = el }}
      className={cn("relative", className)}
      onMouseMove={handleMouseMove}
    >
      <div
        ref={iconRef}
        className="tilt-icon transition-transform duration-200 ease-out"
      >
        {children}
      </div>
    </div>
  )
}
