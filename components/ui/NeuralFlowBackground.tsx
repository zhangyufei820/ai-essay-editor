"use client"

import { useEffect, useRef, useCallback } from "react"

interface NeuralFlowBackgroundProps {
  particleCount?: number
  className?: string
  speed?: number
  opacity?: number
}

export function NeuralFlowBackground({
  particleCount = 60,
  className = "",
  speed = 0.3,
  opacity = 0.4
}: NeuralFlowBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const particlesRef = useRef<Array<{
    x: number
    y: number
    vx: number
    vy: number
    radius: number
    color: string
  }>>([])
  const mouseRef = useRef({ x: 0, y: 0 })

  const initParticles = useCallback((width: number, height: number) => {
    const particles = []
    const colors = [
      `rgba(45, 212, 191, ${opacity})`,      // pulse-cyan
      `rgba(20, 184, 166, ${opacity * 0.8})`, // pulse-500
      `rgba(251, 191, 36, ${opacity * 0.4})`, // gold
    ]

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed,
        radius: Math.random() * 1 + 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
      })
    }
    particlesRef.current = particles
  }, [particleCount, speed, opacity])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const { width, height } = canvas

    // 极低透明度清除，产生拖尾效果
    ctx.fillStyle = "rgba(248, 250, 249, 0.03)"
    ctx.fillRect(0, 0, width, height)

    const particles = particlesRef.current
    const mouse = mouseRef.current

    particles.forEach((p, i) => {
      // 鼠标轻微吸引粒子
      const dx = mouse.x - p.x
      const dy = mouse.y - p.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 150 && dist > 0) {
        p.vx += dx * 0.00003
        p.vy += dy * 0.00003
      }

      // 限速
      const maxSpeed = speed * 2
      const currentSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
      if (currentSpeed > maxSpeed) {
        p.vx = (p.vx / currentSpeed) * maxSpeed
        p.vy = (p.vy / currentSpeed) * maxSpeed
      }

      // 更新位置
      p.x += p.vx
      p.y += p.vy

      // 边界反弹
      if (p.x < 0 || p.x > width) p.vx *= -1
      if (p.y < 0 || p.y > height) p.vy *= -1

      // 绘制粒子
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
      ctx.fillStyle = p.color
      ctx.fill()

      // 绘制连线 - 神经元连接效果
      particles.slice(i + 1).forEach((p2) => {
        const ddx = p.x - p2.x
        const ddy = p.y - p2.y
        const distance = Math.sqrt(ddx * ddx + ddy * ddy)
        const maxDist = 100
        if (distance < maxDist) {
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p2.x, p2.y)
          ctx.strokeStyle = `rgba(45, 212, 191, ${(1 - distance / maxDist) * 0.08})`
          ctx.lineWidth = 0.5
          ctx.stroke()
        }
      })
    })

    animationRef.current = requestAnimationFrame(draw)
  }, [speed, opacity])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      initParticles(canvas.width, canvas.height)
    }

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    window.addEventListener("mousemove", handleMouseMove)

    animationRef.current = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener("resize", handleResize)
      window.removeEventListener("mousemove", handleMouseMove)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [draw, initParticles])

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 -z-10 pointer-events-none ${className}`}
      style={{ opacity: 1 }}
    />
  )
}
