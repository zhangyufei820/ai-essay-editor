"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

type NodePoint = {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  phase: number
  radius: number
}

type Pointer = {
  x: number
  y: number
  active: boolean
}

interface HomeInkFlowBackgroundProps {
  className?: string
}

const MAX_CONNECTION_DISTANCE = 170

export function HomeInkFlowBackground({ className }: HomeInkFlowBackgroundProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const frameRef = React.useRef<number | null>(null)
  const nodesRef = React.useRef<NodePoint[]>([])
  const pointerRef = React.useRef<Pointer>({ x: 0, y: 0, active: false })
  const reduceMotionRef = React.useRef(false)

  const initNodes = React.useCallback((width: number, height: number) => {
    const isSmall = width < 768
    const count = Math.min(isSmall ? 34 : 72, Math.max(28, Math.floor((width * height) / 18000)))

    nodesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      z: Math.random(),
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.18,
      phase: Math.random() * Math.PI * 2,
      radius: 1.1 + Math.random() * 1.7,
    }))
  }, [])

  const draw = React.useCallback(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")

    if (!canvas || !context) return

    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const time = Date.now() * 0.001
    const nodes = nodesRef.current
    const pointer = pointerRef.current

    context.clearRect(0, 0, width, height)

    const ink = "63, 90, 66"
    const seal = "178, 58, 44"

    const field = context.createRadialGradient(width * 0.78, height * 0.22, 0, width * 0.78, height * 0.22, width * 0.62)
    field.addColorStop(0, `rgba(${ink}, 0.12)`)
    field.addColorStop(0.48, `rgba(${ink}, 0.035)`)
    field.addColorStop(1, `rgba(${ink}, 0)`)
    context.fillStyle = field
    context.fillRect(0, 0, width, height)

    if (pointer.active) {
      const pointerGlow = context.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 180)
      pointerGlow.addColorStop(0, `rgba(${seal}, 0.11)`)
      pointerGlow.addColorStop(0.5, `rgba(${ink}, 0.05)`)
      pointerGlow.addColorStop(1, "rgba(255, 255, 255, 0)")
      context.fillStyle = pointerGlow
      context.fillRect(0, 0, width, height)
    }

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]

      if (!reduceMotionRef.current) {
        node.x += node.vx * (0.7 + node.z)
        node.y += node.vy * (0.7 + node.z)
      }

      if (node.x < -20) node.x = width + 20
      if (node.x > width + 20) node.x = -20
      if (node.y < -20) node.y = height + 20
      if (node.y > height + 20) node.y = -20

      for (let nextIndex = index + 1; nextIndex < nodes.length; nextIndex += 1) {
        const next = nodes[nextIndex]
        const dx = node.x - next.x
        const dy = node.y - next.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance > MAX_CONNECTION_DISTANCE) continue

        const depth = (node.z + next.z) / 2
        const alpha = (1 - distance / MAX_CONNECTION_DISTANCE) * (0.11 + depth * 0.12)

        context.beginPath()
        context.moveTo(node.x, node.y)
        context.lineTo(next.x, next.y)
        context.strokeStyle = `rgba(${ink}, ${alpha})`
        context.lineWidth = 0.45 + depth * 0.5
        context.stroke()

        if (index % 3 === 0) {
          const progress = (time * (0.1 + depth * 0.24) + node.phase) % 1
          const flowX = node.x + (next.x - node.x) * progress
          const flowY = node.y + (next.y - node.y) * progress

          context.beginPath()
          context.arc(flowX, flowY, 0.75 + depth * 1.2, 0, Math.PI * 2)
          context.fillStyle = `rgba(${seal}, ${alpha * 2.1})`
          context.fill()
        }
      }
    }

    for (const node of nodes) {
      const pulse = reduceMotionRef.current ? 0.8 : Math.sin(time * 1.8 + node.phase) * 0.22 + 0.78
      const depthScale = 0.7 + node.z * 1.4
      const radius = node.radius * depthScale * pulse

      const glow = context.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius * 6)
      glow.addColorStop(0, `rgba(${ink}, ${0.12 + node.z * 0.12})`)
      glow.addColorStop(1, `rgba(${ink}, 0)`)
      context.fillStyle = glow
      context.beginPath()
      context.arc(node.x, node.y, radius * 6, 0, Math.PI * 2)
      context.fill()

      context.beginPath()
      context.arc(node.x, node.y, radius, 0, Math.PI * 2)
      context.fillStyle = `rgba(${ink}, ${0.25 + node.z * 0.35})`
      context.fill()
    }

    frameRef.current = requestAnimationFrame(draw)
  }, [])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const resizeObserver = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect
      const scale = Math.min(window.devicePixelRatio || 1, 2)

      canvas.width = Math.max(1, Math.floor(rect.width * scale))
      canvas.height = Math.max(1, Math.floor(rect.height * scale))
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`

      const context = canvas.getContext("2d")
      context?.setTransform(scale, 0, 0, scale, 0, 0)
      initNodes(rect.width, rect.height)
    })

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointerRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        active: true,
      }
    }

    const handlePointerLeave = () => {
      pointerRef.current.active = false
    }

    reduceMotionRef.current = motionQuery.matches
    resizeObserver.observe(canvas)
    canvas.addEventListener("pointermove", handlePointerMove)
    canvas.addEventListener("pointerleave", handlePointerLeave)
    frameRef.current = requestAnimationFrame(draw)

    return () => {
      resizeObserver.disconnect()
      canvas.removeEventListener("pointermove", handlePointerMove)
      canvas.removeEventListener("pointerleave", handlePointerLeave)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [draw, initNodes])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
    />
  )
}
