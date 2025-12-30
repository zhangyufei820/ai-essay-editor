/**
 * 💬 沈翔学校 - 消息气泡组件 (Message Bubble)
 * 
 * 聊天界面的核心组件，用于渲染用户消息和 AI 消息。
 */

"use client"

import { memo, useState } from "react"
import { motion, type Easing } from "framer-motion"
import { Copy, Check, User, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { brandColors, slateColors } from "@/lib/design-tokens"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

// ============================================
// 类型定义
// ============================================

interface MessageBubbleProps {
  /** 消息角色：user | assistant */
  role: "user" | "assistant"
  /** 消息内容 */
  content: string
  /** 是否正在流式输出 */
  isStreaming?: boolean
  /** 时间戳 */
  timestamp?: Date
  /** 头像 URL */
  avatar?: string
  /** 复制回调 */
  onCopy?: () => void
  /** 自定义类名 */
  className?: string
}

// ============================================
// 动画配置
// ============================================

const userMessageVariants = {
  hidden: { 
    opacity: 0, 
    x: 20, 
    scale: 0.95 
  },
  visible: { 
    opacity: 1, 
    x: 0, 
    scale: 1,
    transition: { 
      duration: 0.35,
      ease: [0.33, 1, 0.68, 1] as Easing
    }
  }
}

const assistantMessageVariants = {
  hidden: { 
    opacity: 0, 
    x: -20, 
    scale: 0.95 
  },
  visible: { 
    opacity: 1, 
    x: 0, 
    scale: 1,
    transition: { 
      duration: 0.35,
      ease: [0.33, 1, 0.68, 1] as Easing
    }
  }
}

// ============================================
// 流式光标组件
// ============================================

function StreamingCursor() {
  return (
    <motion.span
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.8, repeat: Infinity }}
      className="inline-block ml-0.5"
      style={{ 
        width: 2, 
        height: "1em", 
        backgroundColor: brandColors[600],
        verticalAlign: "text-bottom"
      }}
    />
  )
}

// ============================================
// 用户头像组件
// ============================================

function UserAvatar({ avatar }: { avatar?: string }) {
  if (avatar) {
    return (
      <img 
        src={avatar} 
        alt="用户头像" 
        className="w-8 h-8 rounded-full object-cover"
      />
    )
  }
  
  return (
    <div 
      className="w-8 h-8 rounded-full flex items-center justify-center"
      style={{ backgroundColor: slateColors[200] }}
    >
      <User className="w-4 h-4" style={{ color: slateColors[500] }} />
    </div>
  )
}

// ============================================
// AI 头像组件
// ============================================

function AIAvatar() {
  return (
    <div 
      className="w-8 h-8 rounded-full flex items-center justify-center"
      style={{ 
        background: `linear-gradient(135deg, ${brandColors[900]} 0%, ${brandColors[700]} 100%)` 
      }}
    >
      <Sparkles className="w-4 h-4 text-white" />
    </div>
  )
}

// ============================================
// 复制按钮组件
// ============================================

function CopyButton({ content, onCopy }: { content: string; onCopy?: () => void }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      onCopy?.()
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("复制失败:", err)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded text-xs transition-all duration-200",
        "opacity-0 group-hover:opacity-100",
        copied 
          ? "text-green-600 bg-green-50" 
          : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
      )}
    >
      {copied ? (
        <>
          <Check className="w-3 h-3" />
          <span>已复制</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          <span>复制</span>
        </>
      )}
    </button>
  )
}

// ============================================
// 时间戳组件
// ============================================

function Timestamp({ date }: { date: Date }) {
  const formatted = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <span 
      className="text-xs opacity-50"
      style={{ color: slateColors[400] }}
    >
      {formatted}
    </span>
  )
}

// ============================================
// Markdown 渲染组件（简化版）
// ============================================

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
        li: ({ children }) => <li className="mb-1">{children}</li>,
        code: ({ children, className }) => {
          const isInline = !className
          if (isInline) {
            return (
              <code 
                className="px-1.5 py-0.5 rounded text-sm"
                style={{ 
                  backgroundColor: slateColors[100],
                  color: brandColors[800]
                }}
              >
                {children}
              </code>
            )
          }
          return (
            <code className={cn("block p-3 rounded-lg text-sm overflow-x-auto", className)}>
              {children}
            </code>
          )
        },
        pre: ({ children }) => (
          <pre 
            className="rounded-lg overflow-hidden mb-2"
            style={{ backgroundColor: slateColors[900] }}
          >
            {children}
          </pre>
        ),
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        a: ({ href, children }) => (
          <a 
            href={href} 
            target="_blank" 
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            style={{ color: brandColors[700] }}
          >
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

// ============================================
// 消息气泡主组件
// ============================================

const MessageBubble = memo(function MessageBubble({
  role,
  content,
  isStreaming = false,
  timestamp,
  avatar,
  onCopy,
  className,
}: MessageBubbleProps) {
  const isUser = role === "user"

  // 用户消息样式
  const userBubbleStyle = {
    backgroundColor: brandColors[900],
    color: "white",
    borderRadius: "16px 4px 16px 16px",
    maxWidth: "75%",
  }

  // AI 消息样式
  const assistantBubbleStyle = {
    backgroundColor: slateColors[50],
    color: slateColors[700],
    borderRadius: "4px 16px 16px 16px",
    maxWidth: "85%",
  }

  return (
    <motion.div
      variants={isUser ? userMessageVariants : assistantMessageVariants}
      initial="hidden"
      animate="visible"
      className={cn(
        "flex gap-3 group",
        isUser ? "flex-row-reverse" : "flex-row",
        className
      )}
    >
      {/* 头像 */}
      <div className="flex-shrink-0 mt-1">
        {isUser ? <UserAvatar avatar={avatar} /> : <AIAvatar />}
      </div>

      {/* 消息内容 */}
      <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
        <div
          className="px-4 py-3 shadow-sm"
          style={isUser ? userBubbleStyle : assistantBubbleStyle}
        >
          {isUser ? (
            // 用户消息：普通文本，保留换行
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {content}
            </p>
          ) : (
            // AI 消息：Markdown 渲染
            <div className="text-sm leading-relaxed prose prose-sm max-w-none">
              <MarkdownContent content={content} />
              {isStreaming && <StreamingCursor />}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className={cn(
          "flex items-center gap-2 mt-1 px-1",
          isUser ? "flex-row-reverse" : "flex-row"
        )}>
          {/* 时间戳 */}
          {timestamp && <Timestamp date={timestamp} />}
          
          {/* AI 消息的复制按钮 */}
          {!isUser && !isStreaming && content && (
            <CopyButton content={content} onCopy={onCopy} />
          )}
        </div>
      </div>
    </motion.div>
  )
})

export { MessageBubble }
export default MessageBubble
