"use client"

import { useId } from "react"
import { cn } from "@/lib/utils"

type AssistantEyeAvatarSize = "sm" | "md" | "lg" | "xl"

interface AssistantEyeAvatarProps {
  size?: AssistantEyeAvatarSize
  isActive?: boolean
  className?: string
  title?: string
}

const sizeClassName: Record<AssistantEyeAvatarSize, string> = {
  sm: "h-9 w-9",
  md: "h-11 w-11 sm:h-12 sm:w-12",
  lg: "h-14 w-14",
  xl: "h-16 w-16 sm:h-[72px] sm:w-[72px]",
}

export function AssistantEyeAvatar({
  size = "md",
  isActive = false,
  className,
  title = "AI 助手头像",
}: AssistantEyeAvatarProps) {
  const gradientId = useId().replace(/:/g, "")

  return (
    <svg
      viewBox="0 0 96 96"
      role="img"
      aria-label={title}
      className={cn(
        "shrink-0 overflow-visible drop-shadow-[0_8px_12px_rgba(16,83,50,0.14)]",
        sizeClassName[size],
        className,
      )}
    >
      <defs>
        <linearGradient id={gradientId} x1="18" y1="16" x2="78" y2="78">
          <stop stopColor="#fffdf2" />
          <stop offset=".52" stopColor="#f4fbf4" />
          <stop offset="1" stopColor="#e3f2e6" />
        </linearGradient>
        <style>
          {`
            .sx-eye-avatar-body {
              transform-box: fill-box;
              transform-origin: center;
              animation: sx-eye-avatar-breathe 2.9s ease-in-out infinite;
            }

            .sx-eye-avatar-shine {
              transform-box: fill-box;
              transform-origin: center;
              animation: sx-eye-avatar-shine 4.2s ease-in-out infinite;
            }

            .sx-eye-avatar-eye,
            .sx-eye-avatar-pupil {
              transform-box: fill-box;
              transform-origin: center;
            }

            .sx-eye-avatar-eyes {
              transform-box: fill-box;
              transform-origin: center;
              animation: sx-eye-avatar-idle-blink 5.6s ease-in-out infinite;
            }

            .sx-eye-avatar-pupils {
              transform-box: fill-box;
              transform-origin: center;
              animation: sx-eye-avatar-idle-look 6.4s ease-in-out infinite;
            }

            .sx-eye-avatar-spark {
              transform-box: fill-box;
              transform-origin: center;
              animation: sx-eye-avatar-soft-spark 3.6s ease-in-out infinite;
            }

            .sx-eye-avatar-closed {
              animation: sx-eye-avatar-idle-closed 5.6s ease-in-out infinite;
            }

            .sx-eye-avatar-active .sx-eye-avatar-body {
              animation:
                sx-eye-avatar-hop 1.15s cubic-bezier(.33, 1, .68, 1) infinite,
                sx-eye-avatar-breathe 2.4s ease-in-out infinite;
            }

            .sx-eye-avatar-active .sx-eye-avatar-eyes {
              animation: sx-eye-avatar-blink 3.8s ease-in-out infinite;
            }

            .sx-eye-avatar-active .sx-eye-avatar-pupils {
              animation: sx-eye-avatar-look 2.5s ease-in-out infinite;
            }

            .sx-eye-avatar-active .sx-eye-avatar-spark {
              animation: sx-eye-avatar-spark 1.8s ease-in-out infinite;
            }

            .sx-eye-avatar-active .sx-eye-avatar-closed {
              animation: sx-eye-avatar-closed-blink 3.8s ease-in-out infinite;
            }

            @keyframes sx-eye-avatar-breathe {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.025); }
            }

            @keyframes sx-eye-avatar-hop {
              0%, 100% { transform: translateY(0) scale(1); }
              22% { transform: translateY(-5px) scale(1.045); }
              42% { transform: translateY(1.5px) scale(.985); }
              64% { transform: translateY(-2.5px) scale(1.02); }
            }

            @keyframes sx-eye-avatar-idle-look {
              0%, 22% { transform: translate(0, 0); }
              34%, 48% { transform: translate(1.8px, .2px); }
              60%, 72% { transform: translate(-1.8px, -.4px); }
              86%, 100% { transform: translate(.4px, 0); }
            }

            @keyframes sx-eye-avatar-look {
              0%, 14% { transform: translate(-4px, 1.2px); }
              28%, 44% { transform: translate(4px, 0); }
              58%, 72% { transform: translate(-2.3px, -1.2px); }
              88%, 100% { transform: translate(1.2px, 0); }
            }

            @keyframes sx-eye-avatar-idle-blink {
              0%, 10%, 55%, 66%, 100% { transform: scaleY(1); opacity: 1; }
              12%, 57% { transform: scaleY(.1); opacity: .2; }
              14%, 59% { transform: scaleY(1); opacity: 1; }
            }

            @keyframes sx-eye-avatar-idle-closed {
              0%, 10%, 55%, 66%, 100% { opacity: 0; }
              12%, 57% { opacity: 1; }
              14%, 59% { opacity: 0; }
            }

            @keyframes sx-eye-avatar-blink {
              0%, 8%, 30%, 42%, 65%, 74%, 100% { transform: scaleY(1); opacity: 1; }
              10%, 32%, 67% { transform: scaleY(.12); opacity: .18; }
              11.5%, 33.5%, 68.5% { transform: scaleY(1); opacity: 1; }
            }

            @keyframes sx-eye-avatar-closed-blink {
              0%, 8%, 30%, 42%, 65%, 74%, 100% { opacity: 0; }
              10%, 32%, 67% { opacity: 1; }
              11.5%, 33.5%, 68.5% { opacity: 0; }
            }

            @keyframes sx-eye-avatar-shine {
              0%, 100% { opacity: .82; transform: translateX(0); }
              45% { opacity: .48; transform: translateX(2.4px); }
              70% { opacity: .95; transform: translateX(-1.4px); }
            }

            @keyframes sx-eye-avatar-soft-spark {
              0%, 100% { opacity: .42; transform: scale(.9) rotate(0deg); }
              48% { opacity: .72; transform: scale(1.04) rotate(10deg); }
            }

            @keyframes sx-eye-avatar-spark {
              0%, 100% { opacity: .46; transform: scale(.88) rotate(0deg); }
              45% { opacity: .95; transform: scale(1.18) rotate(16deg); }
              70% { opacity: .62; transform: scale(.98) rotate(-8deg); }
            }

            @media (prefers-reduced-motion: reduce) {
              .sx-eye-avatar-body,
              .sx-eye-avatar-shine,
              .sx-eye-avatar-active .sx-eye-avatar-body,
              .sx-eye-avatar-active .sx-eye-avatar-eyes,
              .sx-eye-avatar-active .sx-eye-avatar-pupils,
              .sx-eye-avatar-active .sx-eye-avatar-spark,
              .sx-eye-avatar-active .sx-eye-avatar-closed {
                animation: none;
              }
            }
          `}
        </style>
      </defs>
      <g className={cn("sx-eye-avatar", isActive && "sx-eye-avatar-active")}>
        <g className="sx-eye-avatar-body">
          <rect
            x="9"
            y="16"
            width="78"
            height="66"
            rx="28"
            fill={`url(#${gradientId})`}
            stroke="#2f5138"
            strokeWidth="3"
          />
          <path
            className="sx-eye-avatar-shine"
            d="M25 27c14-5 31-5 46 0"
            fill="none"
            stroke="#fff"
            strokeWidth="5.2"
            strokeLinecap="round"
            opacity=".82"
          />
          <g className="sx-eye-avatar-eyes">
            <rect className="sx-eye-avatar-eye" x="27.5" y="39" width="18" height="18" rx="5.5" fill="#fffefa" stroke="#2f5138" strokeWidth="1.8" />
            <rect className="sx-eye-avatar-eye" x="51.5" y="39" width="18" height="18" rx="5.5" fill="#fffefa" stroke="#2f5138" strokeWidth="1.8" />
          </g>
          <g className="sx-eye-avatar-closed" opacity="0">
            <path d="M29.5 48h15" fill="none" stroke="#2f5138" strokeWidth="3.2" strokeLinecap="round" />
            <path d="M53.5 48h15" fill="none" stroke="#2f5138" strokeWidth="3.2" strokeLinecap="round" />
          </g>
          <g className="sx-eye-avatar-pupils">
            <circle className="sx-eye-avatar-pupil" cx="36.5" cy="48" r="3.1" fill="#2f5138" />
            <circle className="sx-eye-avatar-pupil" cx="60.5" cy="48" r="3.1" fill="#2f5138" />
          </g>
          <g className="sx-eye-avatar-spark" opacity=".42">
            <path d="M79 27l1.8 4 4.1 1.7-4.1 1.7L79 38.5l-1.8-4.1-4.1-1.7 4.1-1.7L79 27Z" fill="#2f5138" />
          </g>
        </g>
      </g>
    </svg>
  )
}
