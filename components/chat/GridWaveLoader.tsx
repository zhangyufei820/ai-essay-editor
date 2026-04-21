"use client"

/**
 * 点阵波纹加载动画 (Grid Wave Loading Animation)
 *
 * 视觉：10x10 点阵网格，从中心向外扩散的波纹效果
 * 动画：每个点的 opacity 在 0.1-0.8 之间循环，伴随微小的缩放
 * 延迟算法：基于到中心点的距离计算延迟，实现平滑的径向波纹
 */

import { useEffect, useRef } from "react"

interface GridWaveLoaderProps {
  size?: number       // 容器大小，默认 200px
  dotSize?: number    // 点大小，默认 6px
  color?: string      // 点颜色，默认 #FFFFFF
  backgroundColor?: string // 背景色，默认 #2A2B32
  gridSize?: number   // 网格行列数，默认 10
  duration?: number   // 单次波纹周期（秒），默认 2s
}

export function GridWaveLoader({
  size = 200,
  dotSize = 6,
  color = "#FFFFFF",
  backgroundColor = "#2A2B32",
  gridSize = 10,
  duration = 2,
}: GridWaveLoaderProps) {
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!gridRef.current) return

    // 清除现有内容
    gridRef.current.innerHTML = ""

    // 计算中心点
    const centerRow = (gridSize - 1) / 2
    const centerCol = (gridSize - 1) / 2

    // 最大距离（角落到中心）
    const maxDistance = Math.sqrt(centerRow * centerRow + centerCol * centerCol)

    // 创建点阵
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const dot = document.createElement("div")
        dot.className = "grid-wave-dot"

        // 计算到中心点的距离
        const distance = Math.sqrt(
          Math.pow(row - centerRow, 2) + Math.pow(col - centerCol, 2)
        )

        // 归一化延迟（0 到 1）
        const normalizedDelay = distance / maxDistance

        // 计算 animation-delay（秒）
        // 使用 duration * normalizedDelay 确保波纹从中心向外传播
        const delay = normalizedDelay * duration * 0.5 // 乘以 0.5 使波纹更快

        dot.style.cssText = `
          width: ${dotSize}px;
          height: ${dotSize}px;
          border-radius: 50%;
          background-color: ${color};
          animation-delay: -${delay}s;
        `

        gridRef.current.appendChild(dot)
      }
    }
  }, [size, dotSize, color, gridSize, duration])

  return (
    <div
      className="grid-wave-container"
      style={{
        width: size,
        height: size,
        backgroundColor,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        ref={gridRef}
        className="grid-wave-grid"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
          gridTemplateRows: `repeat(${gridSize}, 1fr)`,
          gap: (size - dotSize * gridSize) / (gridSize + 1),
        }}
      />
      <style jsx>{`
        @keyframes gridWave {
          0%, 100% {
            opacity: 0.15;
            transform: scale(0.85);
          }
          50% {
            opacity: 0.9;
            transform: scale(1.15);
          }
        }

        .grid-wave-dot {
          animation: gridWave ${duration}s ease-in-out infinite;
        }
      `}</style>
      <style jsx global>{`
        @keyframes gridWave {
          0%, 100% {
            opacity: 0.15;
            transform: scale(0.85);
          }
          50% {
            opacity: 0.9;
            transform: scale(1.15);
          }
        }
      `}</style>
    </div>
  )
}
