/**
 * 🎯 GenSpark 风格流式光标 (Streaming Cursor)
 * 
 * 在正在生成的文本末尾显示闪烁的块状光标
 * 模仿终端/GenSpark 的打字质感
 * 
 * 设计规范：
 * - 块状光标（Block Cursor）
 * - 使用 emerald-500 绿色
 * - 1s 闪烁动画
 */

"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface StreamingCursorProps {
  /** 是否显示光标 */
  isStreaming?: boolean
  /** 自定义类名 */
  className?: string
  /** 光标样式：block=块状, line=竖线 */
  variant?: "block" | "line"
}

export const StreamingCursor: React.FC<StreamingCursorProps> = ({
  isStreaming = true,
  className,
  variant = "block"
}) => {
  if (!isStreaming) return null

  return (
    <span
      className={cn(
        "streaming-cursor inline-block",
        variant === "block" && "streaming-cursor-block",
        variant === "line" && "streaming-cursor-line",
        className
      )}
      aria-hidden="true"
    >
      {variant === "block" ? "▍" : "|"}
    </span>
  )
}

// CSS 样式（需要添加到 globals.css）
export const streamingCursorStyles = `
/* GenSpark 风格流式光标 */
.streaming-cursor {
  color: #10b981; /* emerald-500 */
  animation: cursor-blink 1s step-end infinite;
  margin-left: 1px;
  font-weight: normal;
}

.streaming-cursor-block {
  font-size: 1em;
  line-height: 1;
  vertical-align: text-bottom;
}

.streaming-cursor-line {
  font-size: 1.1em;
  font-weight: 300;
}

@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* 暗色模式 */
.dark .streaming-cursor {
  color: #34d399; /* emerald-400 */
}
`

export default StreamingCursor
