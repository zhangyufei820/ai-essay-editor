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
  baseDotColor?: string
  primaryDotColor?: string
  creamDotColor?: string
  label?: string
}

const BRAND_GREEN = "#14532d"
const SOFT_GREEN = "#b8d9c2"
const CREAM = "#fff7e8"
const PANEL_GRAY = "#2F3136"

export function buildGridWaveDots(gridSize: number) {
  return Array.from({ length: gridSize * gridSize }, (_, index) => {
    const row = Math.floor(index / gridSize)
    const col = index % gridSize
    const tone = (row + col) % 3 === 0 ? "cream" : (row + col) % 3 === 1 ? "primary" : "base"

    return {
      key: `${row}-${col}`,
      row,
      col,
      tone,
      delay: Number(((row + col) * 0.08).toFixed(2)),
    }
  })
}

export function GridWaveLoader({
  size,
  maxWidth = 400,
  gridSize = 14,
  dotSize = 6,
  gap = 6,
  duration = 2.6,
  backgroundColor = PANEL_GRAY,
  baseDotColor = SOFT_GREEN,
  primaryDotColor = BRAND_GREEN,
  creamDotColor = CREAM,
  label = "正在生成更细致的图像，请稍候。",
}: GridWaveLoaderProps) {
  const panelWidth = size ?? maxWidth

  const dots = useMemo(() => {
    return buildGridWaveDots(gridSize)
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
          "--sx-loader-dot-base": baseDotColor,
          "--sx-loader-dot-primary": primaryDotColor,
          "--sx-loader-dot-cream": creamDotColor,
        } as CSSProperties}
      >
        <div className="sx-grid-loader__panel">
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
                className={`sx-grid-loader__dot sx-grid-loader__dot--${dot.tone}`}
                style={{
                  width: `${dotSize}px`,
                  height: `${dotSize}px`,
                  animationDelay: `${dot.delay}s`,
                }}
              />
            ))}
          </div>

          <span className="sx-grid-loader__shine sx-grid-loader__shine--primary" />
          <span className="sx-grid-loader__shine sx-grid-loader__shine--cream" />
          <span className="sr-only">{label}</span>
        </div>
      </div>

      <style jsx global>{`
        @keyframes wave-pulse {
          0%, 100% {
            opacity: 0.1;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.2);
          }
        }

        @keyframes sx-grid-diagonal-scan {
          0% {
            transform: translate3d(-52%, -52%, 0) rotate(42deg);
            opacity: 0;
          }
          50% {
            opacity: 0.55;
          }
          100% {
            transform: translate3d(52%, 52%, 0) rotate(42deg);
            opacity: 0;
          }
        }

        @keyframes sx-grid-cream-scan {
          0% {
            transform: translate3d(-46%, -36%, 0) rotate(42deg);
            opacity: 0;
          }
          50% {
            opacity: 0.36;
          }
          100% {
            transform: translate3d(46%, 36%, 0) rotate(42deg);
            opacity: 0;
          }
        }

        .sx-grid-loader {
          position: relative;
        }

        .sx-grid-loader__panel {
          position: relative;
          overflow: hidden;
          aspect-ratio: 1 / 1;
          border-radius: 16px;
          border: 1px solid rgba(255, 247, 232, 0.08);
          background:
            radial-gradient(circle at 28% 20%, rgba(255, 247, 232, 0.12), transparent 32%),
            radial-gradient(circle at 76% 82%, rgba(20, 83, 45, 0.24), transparent 34%),
            var(--sx-loader-background);
          box-shadow:
            0 18px 42px rgba(15, 23, 42, 0.18),
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            inset 0 -20px 40px rgba(0, 0, 0, 0.16);
          display: grid;
          place-items: center;
          padding: clamp(20px, 9%, 36px);
        }

        .sx-grid-loader__grid {
          position: relative;
          z-index: 2;
          display: grid;
          place-items: center;
          gap: var(--sx-loader-gap);
          width: min(72%, 292px);
          aspect-ratio: 1 / 1;
        }

        .sx-grid-loader__dot {
          border-radius: 9999px;
          background: var(--sx-loader-dot-base);
          opacity: 0.1;
          animation: wave-pulse var(--sx-loader-duration) ease-in-out infinite;
          box-shadow: 0 0 10px color-mix(in srgb, var(--sx-loader-dot-base) 28%, transparent);
          will-change: opacity, transform;
        }

        .sx-grid-loader__dot--primary {
          background: var(--sx-loader-dot-primary);
          box-shadow: 0 0 14px color-mix(in srgb, var(--sx-loader-dot-primary) 36%, transparent);
        }

        .sx-grid-loader__dot--cream {
          background: var(--sx-loader-dot-cream);
          box-shadow: 0 0 16px rgba(255, 247, 232, 0.34);
        }

        .sx-grid-loader__shine {
          position: absolute;
          inset: -24%;
          z-index: 1;
          pointer-events: none;
          mix-blend-mode: screen;
        }

        .sx-grid-loader__shine--primary {
          background: linear-gradient(90deg, transparent 34%, rgba(20, 83, 45, 0.34), transparent 62%);
          filter: blur(8px);
          animation: sx-grid-diagonal-scan 3.2s ease-in-out infinite;
        }

        .sx-grid-loader__shine--cream {
          background: linear-gradient(90deg, transparent 38%, rgba(255, 247, 232, 0.3), transparent 58%);
          filter: blur(10px);
          animation: sx-grid-cream-scan 3.2s ease-in-out infinite 0.72s;
        }
      `}</style>
    </>
  )
}
