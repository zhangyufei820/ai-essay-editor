"use client"

import type { CSSProperties } from "react"
import { useMemo } from "react"

interface GridWaveLoaderProps {
  size?: number
  maxWidth?: number
  gridSize?: number
  dotSize?: number
  gap?: number
  duration?: number
  backgroundColor?: string
  dotColor?: string
  label?: string
}

const BRAND_GREEN = "#14532d"
const SOFT_GREEN = "#eef7f0"
const SOFT_BORDER = "rgba(20,83,45,0.12)"

export function GridWaveLoader({
  size,
  maxWidth = 280,
  gridSize = 15,
  dotSize = 5,
  gap = 10,
  duration = 3.8,
  backgroundColor = SOFT_GREEN,
  dotColor = BRAND_GREEN,
  label = "正在生成更细致的图像，请稍候。",
}: GridWaveLoaderProps) {
  const panelWidth = size ?? maxWidth

  const dots = useMemo(() => {
    return Array.from({ length: gridSize * gridSize }, (_, index) => {
      const row = Math.floor(index / gridSize)
      const col = index % gridSize

      return {
        key: `${row}-${col}`,
        row,
        col,
        delay: (row * 0.07) + (col * 0.05),
      }
    })
  }, [gridSize])

  return (
    <>
      <div
        className="sx-grid-loader"
        style={{
          width: "100%",
          maxWidth: `${panelWidth}px`,
          "--sx-loader-duration": `${duration}s`,
          "--sx-loader-grid-size": `${gridSize}`,
          "--sx-loader-dot-size": `${dotSize}px`,
          "--sx-loader-gap": `${gap}px`,
          "--sx-loader-background": backgroundColor,
          "--sx-loader-dot": dotColor,
          "--sx-loader-border": SOFT_BORDER,
        } as CSSProperties}
      >
        <div className="sx-grid-loader__panel">
          <div className="sx-grid-loader__glow sx-grid-loader__glow--horizontal" />
          <div className="sx-grid-loader__glow sx-grid-loader__glow--vertical" />

          <div className="sx-grid-loader__header">
            <span className="sx-grid-loader__label">{label}</span>
          </div>

          <div
            className="sx-grid-loader__grid"
            style={{
              gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
              gap: `${gap}px`,
            }}
          >
            {dots.map((dot) => (
              <span
                key={dot.key}
                className="sx-grid-loader__dot"
                style={{
                  width: `${dotSize}px`,
                  height: `${dotSize}px`,
                  animationDelay: `-${dot.delay}s`,
                }}
              />
            ))}
          </div>

          <div className="sx-grid-loader__status">
            <span className="sx-grid-loader__pulse" />
            AI imaging pipeline active
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes sx-grid-dot-pulse {
          0%, 100% {
            opacity: 0.22;
            transform: scale(0.78);
            box-shadow: 0 0 0 rgba(20, 83, 45, 0);
          }
          50% {
            opacity: 0.88;
            transform: scale(1.16);
            box-shadow: 0 0 12px rgba(20, 83, 45, 0.22);
          }
        }

        @keyframes sx-grid-scan-x {
          0% {
            transform: translateX(-115%);
            opacity: 0;
          }
          10% {
            opacity: 0.65;
          }
          50% {
            opacity: 0.92;
          }
          90% {
            opacity: 0.48;
          }
          100% {
            transform: translateX(115%);
            opacity: 0;
          }
        }

        @keyframes sx-grid-scan-y {
          0% {
            transform: translateY(-120%);
            opacity: 0;
          }
          18% {
            opacity: 0.42;
          }
          55% {
            opacity: 0.7;
          }
          100% {
            transform: translateY(120%);
            opacity: 0;
          }
        }

        @keyframes sx-grid-pulse-dot {
          0%, 100% {
            opacity: 0.45;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.06);
          }
        }

        .sx-grid-loader {
          position: relative;
        }

        .sx-grid-loader__panel {
          position: relative;
          overflow: hidden;
          border-radius: 28px;
          border: 1px solid var(--sx-loader-border);
          background:
            radial-gradient(circle at top left, rgba(255,255,255,0.85), transparent 32%),
            linear-gradient(180deg, rgba(255,255,255,0.68), rgba(255,255,255,0.36)),
            var(--sx-loader-background);
          box-shadow:
            0 10px 24px rgba(15, 23, 42, 0.05),
            0 24px 60px rgba(20, 83, 45, 0.08),
            inset 0 1px 0 rgba(255,255,255,0.75);
          padding: 18px 18px 16px;
        }

        .sx-grid-loader__header {
          position: relative;
          z-index: 2;
          margin-bottom: 18px;
        }

        .sx-grid-loader__label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #1f3d2b;
          font-size: 14px;
          line-height: 1.7;
          font-weight: 500;
          letter-spacing: 0.01em;
        }

        .sx-grid-loader__grid {
          position: relative;
          z-index: 2;
          display: grid;
          place-items: center;
          min-height: 164px;
          padding: 6px 2px 2px;
        }

        .sx-grid-loader__dot {
          border-radius: 9999px;
          background: var(--sx-loader-dot);
          opacity: 0.18;
          animation: sx-grid-dot-pulse var(--sx-loader-duration) ease-in-out infinite;
        }

        .sx-grid-loader__glow {
          position: absolute;
          z-index: 1;
          pointer-events: none;
        }

        .sx-grid-loader__glow--horizontal {
          top: 26%;
          left: -20%;
          width: 42%;
          height: 46%;
          background: linear-gradient(
            90deg,
            rgba(20, 83, 45, 0),
            rgba(20, 83, 45, 0.05),
            rgba(20, 83, 45, 0.18),
            rgba(20, 83, 45, 0.05),
            rgba(20, 83, 45, 0)
          );
          filter: blur(8px);
          animation: sx-grid-scan-x calc(var(--sx-loader-duration) * 1.1) ease-in-out infinite;
        }

        .sx-grid-loader__glow--vertical {
          top: -18%;
          left: 24%;
          width: 52%;
          height: 34%;
          background: linear-gradient(
            180deg,
            rgba(20, 83, 45, 0),
            rgba(20, 83, 45, 0.04),
            rgba(20, 83, 45, 0.14),
            rgba(20, 83, 45, 0.04),
            rgba(20, 83, 45, 0)
          );
          filter: blur(10px);
          animation: sx-grid-scan-y calc(var(--sx-loader-duration) * 1.4) ease-in-out infinite;
        }

        .sx-grid-loader__status {
          position: relative;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 14px;
          padding: 8px 12px;
          border-radius: 9999px;
          border: 1px solid rgba(20, 83, 45, 0.12);
          background: rgba(255,255,255,0.62);
          color: rgba(20, 83, 45, 0.72);
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .sx-grid-loader__pulse {
          width: 7px;
          height: 7px;
          border-radius: 9999px;
          background: var(--sx-loader-dot);
          animation: sx-grid-pulse-dot 1.8s ease-in-out infinite;
          box-shadow: 0 0 10px rgba(20, 83, 45, 0.26);
        }

        @media (max-width: 640px) {
          .sx-grid-loader__panel {
            border-radius: 24px;
            padding: 16px 16px 14px;
          }

          .sx-grid-loader__grid {
            min-height: 146px;
          }

          .sx-grid-loader__label {
            font-size: 13px;
          }
        }
      `}</style>
    </>
  )
}
