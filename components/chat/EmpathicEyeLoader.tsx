"use client"

import type { CSSProperties } from "react"

type EyeShape = {
  leftX: number
  leftY: number
  rightX: number
  rightY: number
  pupilX: number
  pupilY: number
  scaleX: number
  scaleY: number
  rotate?: number
}

export type EmpathicEyeMood = {
  name: string
  eyes: EyeShape
  brow?: "soft" | "focus" | "curious" | "happy" | "sleepy"
}

export const EMPATHIC_EYE_MOODS: EmpathicEyeMood[] = [
  { name: "listening-right", eyes: { leftX: 34, leftY: 39, rightX: 54, rightY: 39, pupilX: 3.2, pupilY: 1.2, scaleX: 1, scaleY: 1 }, brow: "soft" },
  { name: "scan-left", eyes: { leftX: 33, leftY: 38, rightX: 53, rightY: 38, pupilX: -3.4, pupilY: 0, scaleX: 1, scaleY: 1 }, brow: "curious" },
  { name: "scan-right", eyes: { leftX: 35, leftY: 38, rightX: 55, rightY: 38, pupilX: 3.8, pupilY: 0, scaleX: 1, scaleY: 1 }, brow: "curious" },
  { name: "blink", eyes: { leftX: 34, leftY: 39, rightX: 54, rightY: 39, pupilX: 0, pupilY: 0, scaleX: 1.1, scaleY: 0.12 }, brow: "soft" },
  { name: "wide-idea", eyes: { leftX: 34, leftY: 38, rightX: 54, rightY: 38, pupilX: 0, pupilY: -1.8, scaleX: 1.08, scaleY: 1.2 }, brow: "happy" },
  { name: "focus", eyes: { leftX: 34, leftY: 39, rightX: 54, rightY: 39, pupilX: 0, pupilY: 1.8, scaleX: 1.18, scaleY: 0.72 }, brow: "focus" },
  { name: "thinking-up", eyes: { leftX: 34, leftY: 37, rightX: 54, rightY: 37, pupilX: 0.8, pupilY: -3.3, scaleX: 1, scaleY: 1 }, brow: "curious" },
  { name: "double-check", eyes: { leftX: 32, leftY: 39, rightX: 56, rightY: 38, pupilX: -1.6, pupilY: 1.4, scaleX: 0.92, scaleY: 1.08, rotate: -5 }, brow: "focus" },
  { name: "smile", eyes: { leftX: 34, leftY: 39, rightX: 54, rightY: 39, pupilX: 1, pupilY: 0.4, scaleX: 1.05, scaleY: 0.64 }, brow: "happy" },
  { name: "patient", eyes: { leftX: 34, leftY: 40, rightX: 54, rightY: 40, pupilX: 0, pupilY: 2.4, scaleX: 1.12, scaleY: 0.54 }, brow: "sleepy" },
  { name: "spark", eyes: { leftX: 34, leftY: 38, rightX: 54, rightY: 38, pupilX: 2, pupilY: -2, scaleX: 1.22, scaleY: 1.22 }, brow: "happy" },
  { name: "steady", eyes: { leftX: 34, leftY: 39, rightX: 54, rightY: 39, pupilX: 0, pupilY: 0, scaleX: 1, scaleY: 1 }, brow: "soft" },
]

interface EmpathicEyeLoaderProps {
  longWait?: boolean
  label?: string
  className?: string
}

function Brow({ type }: { type?: EmpathicEyeMood["brow"] }) {
  if (type === "focus") {
    return (
      <>
        <path d="M26 29.5c5.8-2.5 10.9-2.2 15.2.9" />
        <path d="M62 29.5c-5.8-2.5-10.9-2.2-15.2.9" />
      </>
    )
  }

  if (type === "curious") {
    return (
      <>
        <path d="M27 30.5c5.2-4 10-4.2 14.6-.7" />
        <path d="M47 30c4.7-2.6 9.5-2.1 14.4 1.2" />
      </>
    )
  }

  if (type === "happy") {
    return (
      <>
        <path d="M27.5 31.5c4.6-3 9.1-3 13.6 0" />
        <path d="M47 31.5c4.6-3 9.1-3 13.6 0" />
      </>
    )
  }

  if (type === "sleepy") {
    return (
      <>
        <path d="M27 32.5c4.9-.8 9.8-.8 14.8 0" />
        <path d="M46.5 32.5c4.9-.8 9.8-.8 14.8 0" />
      </>
    )
  }

  return (
    <>
      <path d="M27 31c4.7-1.8 9.3-1.8 14 0" />
      <path d="M47 31c4.7-1.8 9.3-1.8 14 0" />
    </>
  )
}

function MoodFrame({ mood, index }: { mood: EmpathicEyeMood; index: number }) {
  const { eyes } = mood
  const transform = `rotate(${eyes.rotate || 0} 44 40)`

  return (
    <g
      className="sx-eye-loader__mood"
      style={{ "--sx-eye-index": index } as CSSProperties}
      data-mood={mood.name}
    >
      <g className="sx-eye-loader__brows" transform={transform}>
        <Brow type={mood.brow} />
      </g>
      <g transform={transform}>
        <ellipse cx={eyes.leftX} cy={eyes.leftY} rx={6.2 * eyes.scaleX} ry={7.8 * eyes.scaleY} className="sx-eye-loader__white" />
        <ellipse cx={eyes.rightX} cy={eyes.rightY} rx={6.2 * eyes.scaleX} ry={7.8 * eyes.scaleY} className="sx-eye-loader__white" />
        {eyes.scaleY > 0.2 && (
          <>
            <circle cx={eyes.leftX + eyes.pupilX} cy={eyes.leftY + eyes.pupilY} r="2.25" className="sx-eye-loader__pupil" />
            <circle cx={eyes.rightX + eyes.pupilX} cy={eyes.rightY + eyes.pupilY} r="2.25" className="sx-eye-loader__pupil" />
          </>
        )}
      </g>
    </g>
  )
}

export function EmpathicEyeLoader({
  longWait = false,
  label = "AI 正在生成回答",
  className,
}: EmpathicEyeLoaderProps) {
  const moodCount = EMPATHIC_EYE_MOODS.length

  return (
    <div
      className={[
        "sx-eye-loader",
        longWait ? "sx-eye-loader--long" : "sx-eye-loader--normal",
        className || "",
      ].filter(Boolean).join(" ")}
      style={{ "--sx-eye-count": moodCount } as CSSProperties}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <svg viewBox="0 0 88 88" className="sx-eye-loader__svg" aria-hidden="true">
        <defs>
          <radialGradient id="sx-eye-core" cx="36%" cy="24%" r="82%">
            <stop offset="0%" stopColor="#1f8f5a" />
            <stop offset="54%" stopColor="#14532d" />
            <stop offset="100%" stopColor="#052e16" />
          </radialGradient>
          <linearGradient id="sx-eye-rim" x1="14" y1="10" x2="76" y2="78">
            <stop offset="0%" stopColor="#86efac" stopOpacity="0.55" />
            <stop offset="50%" stopColor="#10a37f" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#fefefa" stopOpacity="0.16" />
          </linearGradient>
          <filter id="sx-eye-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="14" stdDeviation="13" floodColor="#052e16" floodOpacity="0.18" />
          </filter>
        </defs>

        <g className="sx-eye-loader__body" filter="url(#sx-eye-shadow)">
          <rect x="14" y="14" width="60" height="60" rx="18" fill="url(#sx-eye-core)" />
          <rect x="15.25" y="15.25" width="57.5" height="57.5" rx="16.75" fill="none" stroke="url(#sx-eye-rim)" strokeWidth="1.5" />
          <path d="M25 22c11-5.2 24.8-5.5 38.5-.4" className="sx-eye-loader__top-glint" />
          <circle cx="23.5" cy="23.5" r="1.6" className="sx-eye-loader__signal sx-eye-loader__signal--one" />
          <circle cx="30.2" cy="22.4" r="1.45" className="sx-eye-loader__signal sx-eye-loader__signal--two" />
          <circle cx="36.4" cy="22.6" r="1.25" className="sx-eye-loader__signal sx-eye-loader__signal--three" />
          {EMPATHIC_EYE_MOODS.slice(0, moodCount).map((mood, index) => (
            <MoodFrame key={mood.name} mood={mood} index={index} />
          ))}
          <path d="M34 56c5.6 3.7 13.4 3.8 19.4.1" className="sx-eye-loader__smile" />
        </g>
      </svg>
      <span className="sr-only">{label}</span>

      <style jsx>{`
        .sx-eye-loader {
          --sx-eye-size: 92px;
          --sx-eye-cycle: 9.8s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: var(--sx-eye-size);
          height: var(--sx-eye-size);
          isolation: isolate;
        }

        .sx-eye-loader--long {
          --sx-eye-cycle: 18s;
        }

        .sx-eye-loader__svg {
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        .sx-eye-loader__body {
          transform-origin: 44px 44px;
          animation: sx-eye-bob 1.9s ease-in-out infinite;
        }

        .sx-eye-loader--long .sx-eye-loader__body {
          animation:
            sx-eye-bob 1.9s ease-in-out infinite,
            sx-eye-attentive-tilt 6.6s ease-in-out infinite;
        }

        .sx-eye-loader__top-glint,
        .sx-eye-loader__brows path,
        .sx-eye-loader__smile {
          fill: none;
          stroke: rgba(254, 254, 250, 0.72);
          stroke-width: 2.2;
          stroke-linecap: round;
        }

        .sx-eye-loader__brows {
          opacity: 0.58;
        }

        .sx-eye-loader__white {
          fill: #fefefa;
          transform-box: fill-box;
          transform-origin: center;
        }

        .sx-eye-loader__pupil {
          fill: #052e16;
        }

        .sx-eye-loader__signal {
          fill: #86efac;
          opacity: 0.76;
          animation: sx-eye-signal 2.8s ease-in-out infinite;
        }

        .sx-eye-loader__signal--two {
          animation-delay: 0.25s;
          opacity: 0.58;
        }

        .sx-eye-loader__signal--three {
          animation-delay: 0.5s;
          opacity: 0.42;
        }

        .sx-eye-loader__smile {
          opacity: 0.28;
          animation: sx-eye-smile 4.4s ease-in-out infinite;
        }

        .sx-eye-loader__mood {
          opacity: 0;
          animation: sx-eye-mood var(--sx-eye-cycle) steps(1, end) infinite;
          animation-delay: calc(var(--sx-eye-cycle) / var(--sx-eye-count) * var(--sx-eye-index));
        }

        @keyframes sx-eye-mood {
          0%,
          8.3% {
            opacity: 1;
          }
          8.31%,
          100% {
            opacity: 0;
          }
        }

        @keyframes sx-eye-bob {
          0%,
          100% {
            transform: translateY(0) scale(1);
          }
          42% {
            transform: translateY(-4px) scale(1.015);
          }
          58% {
            transform: translateY(1px) scale(0.995);
          }
        }

        @keyframes sx-eye-attentive-tilt {
          0%,
          100% {
            rotate: 0deg;
          }
          28% {
            rotate: -2.4deg;
          }
          62% {
            rotate: 2.2deg;
          }
        }

        @keyframes sx-eye-signal {
          0%,
          100% {
            transform: translateY(0) scale(1);
            opacity: 0.36;
          }
          48% {
            transform: translateY(-1px) scale(1.25);
            opacity: 0.9;
          }
        }

        @keyframes sx-eye-smile {
          0%,
          62%,
          100% {
            opacity: 0.2;
            stroke-dasharray: 1 22;
          }
          74% {
            opacity: 0.54;
            stroke-dasharray: 22 1;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sx-eye-loader__body,
          .sx-eye-loader__signal,
          .sx-eye-loader__smile,
          .sx-eye-loader__mood {
            animation-duration: 1ms;
            animation-iteration-count: 1;
          }

          .sx-eye-loader__mood:first-of-type {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}
