'use client'

import { useEffect, useRef, useState } from 'react'

interface MagneticGridBackgroundProps {
  className?: string
  auroraColor?: string
  gridSize?: number
  opacity?: number
}

export function MagneticGridBackground({
  className = '',
  auroraColor = '#00D4AA',
  gridSize = 60,
  opacity = 0.15,
}: MagneticGridBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const updateDimensions = () => {
      if (canvasRef.current) {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
        })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || dimensions.width === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = dimensions.width
    canvas.height = dimensions.height

    // Clear canvas
    ctx.clearRect(0, 0, dimensions.width, dimensions.height)

    // Draw magnetic grid
    ctx.strokeStyle = auroraColor
    ctx.lineWidth = 0.5
    ctx.globalAlpha = opacity

    // Vertical lines
    for (let x = 0; x <= dimensions.width; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, dimensions.height)
      ctx.stroke()
    }

    // Horizontal lines
    for (let y = 0; y <= dimensions.height; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(dimensions.width, y)
      ctx.stroke()
    }

    // Draw aurora glow spots at intersections
    ctx.globalAlpha = opacity * 0.5
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, gridSize * 2)
    gradient.addColorStop(0, auroraColor)
    gradient.addColorStop(1, 'transparent')

    for (let x = gridSize; x < dimensions.width; x += gridSize * 2) {
      for (let y = gridSize; y < dimensions.height; y += gridSize * 2) {
        ctx.save()
        ctx.translate(x, y)
        ctx.fillStyle = gradient
        ctx.fillRect(-gridSize * 2, -gridSize * 2, gridSize * 4, gridSize * 4)
        ctx.restore()
      }
    }
  }, [dimensions, auroraColor, gridSize, opacity])

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{ zIndex: -1 }}
    />
  )
}
