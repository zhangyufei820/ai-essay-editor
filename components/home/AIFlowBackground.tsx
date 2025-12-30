/**
 * 🌊 AI 数据流动态背景组件
 * 
 * 使用 Canvas 绘制神经网络风格的动态背景：
 * - 流动的数据点和连接线
 * - 品牌绿色为主色调
 * - 营造智慧和科技的氛围
 */

"use client"

import { useEffect, useRef, useCallback } from "react"

// 粒子类型
interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  opacity: number
  pulsePhase: number
}

// 连接线类型
interface Connection {
  from: number
  to: number
  opacity: number
}

export function AIFlowBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | undefined>(undefined)
  const particlesRef = useRef<Particle[]>([])
  const connectionsRef = useRef<Connection[]>([])
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // 初始化粒子
  const initParticles = useCallback((width: number, height: number) => {
    const particleCount = Math.floor((width * height) / 15000) // 根据屏幕大小调整粒子数量
    const particles: Particle[] = []
    
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 2 + 1,
        opacity: Math.random() * 0.5 + 0.2,
        pulsePhase: Math.random() * Math.PI * 2
      })
    }
    
    particlesRef.current = particles
  }, [])

  // 更新连接
  const updateConnections = useCallback(() => {
    const particles = particlesRef.current
    const connections: Connection[] = []
    const maxDistance = 150

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x
        const dy = particles[i].y - particles[j].y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance < maxDistance) {
          connections.push({
            from: i,
            to: j,
            opacity: (1 - distance / maxDistance) * 0.3
          })
        }
      }
    }

    connectionsRef.current = connections
  }, [])

  // 动画循环
  const animate = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    const particles = particlesRef.current
    const time = Date.now() * 0.001

    // 清空画布
    ctx.clearRect(0, 0, width, height)

    // 更新粒子位置
    particles.forEach((particle, index) => {
      // 基础移动
      particle.x += particle.vx
      particle.y += particle.vy

      // 边界反弹
      if (particle.x < 0 || particle.x > width) particle.vx *= -1
      if (particle.y < 0 || particle.y > height) particle.vy *= -1

      // 保持在边界内
      particle.x = Math.max(0, Math.min(width, particle.x))
      particle.y = Math.max(0, Math.min(height, particle.y))

      // 脉冲效果
      const pulse = Math.sin(time * 2 + particle.pulsePhase) * 0.3 + 0.7
      
      // 绘制粒子
      ctx.beginPath()
      ctx.arc(particle.x, particle.y, particle.radius * pulse, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(34, 197, 94, ${particle.opacity * pulse})`
      ctx.fill()

      // 绘制光晕
      const gradient = ctx.createRadialGradient(
        particle.x, particle.y, 0,
        particle.x, particle.y, particle.radius * 4
      )
      gradient.addColorStop(0, `rgba(34, 197, 94, ${particle.opacity * 0.3 * pulse})`)
      gradient.addColorStop(1, "rgba(34, 197, 94, 0)")
      ctx.beginPath()
      ctx.arc(particle.x, particle.y, particle.radius * 4, 0, Math.PI * 2)
      ctx.fillStyle = gradient
      ctx.fill()
    })

    // 更新并绘制连接线
    updateConnections()
    connectionsRef.current.forEach(connection => {
      const from = particles[connection.from]
      const to = particles[connection.to]

      // 绘制连接线
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.strokeStyle = `rgba(34, 197, 94, ${connection.opacity})`
      ctx.lineWidth = 0.5
      ctx.stroke()

      // 绘制流动的数据点
      const flowProgress = (time * 0.5 + connection.from * 0.1) % 1
      const flowX = from.x + (to.x - from.x) * flowProgress
      const flowY = from.y + (to.y - from.y) * flowProgress
      
      ctx.beginPath()
      ctx.arc(flowX, flowY, 1.5, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(34, 197, 94, ${connection.opacity * 2})`
      ctx.fill()
    })

    // 绘制鼠标附近的增强效果
    const mouseX = mouseRef.current.x
    const mouseY = mouseRef.current.y
    if (mouseX > 0 && mouseY > 0) {
      const mouseGradient = ctx.createRadialGradient(
        mouseX, mouseY, 0,
        mouseX, mouseY, 150
      )
      mouseGradient.addColorStop(0, "rgba(34, 197, 94, 0.1)")
      mouseGradient.addColorStop(1, "rgba(34, 197, 94, 0)")
      ctx.beginPath()
      ctx.arc(mouseX, mouseY, 150, 0, Math.PI * 2)
      ctx.fillStyle = mouseGradient
      ctx.fill()
    }

    animationRef.current = requestAnimationFrame(animate)
  }, [updateConnections])

  // 初始化和清理
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
    
    animationRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener("resize", handleResize)
      window.removeEventListener("mousemove", handleMouseMove)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [initParticles, animate])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.6 }}
    />
  )
}

export default AIFlowBackground
