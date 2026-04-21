"use client"

/**
 * 点阵波纹加载动画 (Grid Wave Loading Animation)
 * ChatGPT DALL·E 3 风格高级感加载组件
 *
 * 特性：
 * - 12x12 密集点阵矩阵
 * - 对角线波纹延迟算法 (row + col) * 0.08s
 * - 从左上角向右下角的海浪式扫过效果
 * - 柔和深灰背景 + 白色高亮点
 */

import { useEffect, useRef, useMemo } from "react"

interface GridWaveLoaderProps {
  maxWidth?: number   // 最大宽度，默认 280px
  gridSize?: number   // 网格行列数，默认 12
  dotSize?: number    // 点大小，默认 4px
  gap?: number        // 点间距，默认 6px
  duration?: number   // 单次波纹周期（秒），默认 3s
  backgroundColor?: string // 背景色，默认 #2F3136
  dotColor?: string   // 点颜色，默认 #FFFFFF
}

export function GridWaveLoader({
  maxWidth = 280,
  gridSize = 12,
  dotSize = 4,
  gap = 6,
  duration = 3,
  backgroundColor = "#2F3136",
  dotColor = "#FFFFFF",
}: GridWaveLoaderProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // 预计算每个点的延迟（基于对角线波纹算法）
  const dotDelays = useMemo(() => {
    const delays: number[][] = []
    for (let row = 0; row < gridSize; row++) {
      const rowDelays: number[] = []
      for (let col = 0; col < gridSize; col++) {
        // 对角线波纹算法：(row_index + col_index) * 0.08s
        // 这会让光晕从左上角像海浪一样扫向右下角
        const delay = (row + col) * 0.08
        rowDelays.push(delay)
      }
      delays.push(rowDelays)
    }
    return delays
  }, [gridSize])

  useEffect(() => {
    if (!containerRef.current) return

    // 清除现有内容
    containerRef.current.innerHTML = ""

    // 创建点阵
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const dot = document.createElement("div")
        dot.className = "grid-wave-dot"

        // 设置基础样式
        dot.style.cssText = `
          width: ${dotSize}px;
          height: ${dotSize}px;
          border-radius: 50%;
          background-color: ${dotColor};
          opacity: 0.1;
          animation-delay: -${dotDelays[row][col]}s;
        `

        containerRef.current.appendChild(dot)
      }
    }
  }, [gridSize, dotSize, dotColor, dotDelays, duration])

  return (
    <>
      {/* 容器 */}
      <div
        className="grid-wave-wrapper"
        style={{
          width: "100%",
          maxWidth: `${maxWidth}px`,
          aspectRatio: "1 / 1",
          backgroundColor,
          borderRadius: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          // 设置 CSS 变量让所有点共享相同的动画周期
          // @ts-ignore
          "--wave-duration": `${duration}s`,
        }}
      >
        {/* 点阵网格 */}
        <div
          ref={containerRef}
          className="grid-wave-container"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
            gridTemplateRows: `repeat(${gridSize}, 1fr)`,
            gap: `${gap}px`,
            width: "100%",
            height: "100%",
          }}
        />
      </div>

      {/* 动画样式 - 使用 CSS 而不是 styled-jsx 以确保在所有环境中生效 */}
      <style jsx global>{`
        @keyframes wave-pulse {
          0%, 100% {
            opacity: 0.1;
            transform: scale(1);
          }
          50% {
            opacity: 0.75;
            transform: scale(1.15);
          }
        }

        .grid-wave-dot {
          animation: wave-pulse var(--wave-duration, 3s) ease-in-out infinite backwards;
        }
      `}</style>
    </>
  )
}
