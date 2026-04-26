/**
 * 💬 Message Bubble Component - Claude Style
 *
 * Refactored to match Claude.ai's visual style:
 * - Flat, minimal container design
 * - Subtle action toolbar (show on hover)
 * - Clean typography with proper line-height
 */

"use client"

import { memo, useMemo, useState } from "react"
import { motion, type Easing } from "framer-motion"
import { Copy, Check, User, Sparkles, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { slateColors } from "@/lib/design-tokens"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"

// Claude style colors
const CLAUDE_TEXT_COLOR = "#374151"
const CLAUDE_SECONDARY_COLOR = "#6B7280"
const CLAUDE_ACCENT_COLOR = "#10A37F" // 沈翔绿
const CLAUDE_AVATAR_BG = "#10B981" // Emerald green

// Conclusion detection - hoisted to module scope to avoid recreation per render
const CONCLUSION_KEYWORDS = ["综上所述", "答案是", "结论是", "所以", "因此", "总之", "故", "可得"] as const

function isConclusionParagraph(text: string): boolean {
  return CONCLUSION_KEYWORDS.some(keyword => text.includes(keyword))
}

// Extract text content from React children for keyword detection
function getTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(getTextContent).join('')
  if (children && typeof children === 'object' && 'props' in children) {
    return getTextContent((children as { props: { children: React.ReactNode } }).props.children)
  }
  return ''
}

// ============================================
// Types
// ============================================

interface MessageBubbleProps {
  role: "user" | "assistant"
  content: string
  isStreaming?: boolean
  timestamp?: Date
  avatar?: string
  onCopy?: () => void
  className?: string
}

// ============================================
// Animation Config
// ============================================

const userMessageVariants = {
  hidden: { opacity: 0, x: 20, scale: 0.95 },
  visible: {
    opacity: 1, x: 0, scale: 1,
    transition: { duration: 0.35, ease: [0.33, 1, 0.68, 1] as Easing }
  }
}

const assistantMessageVariants = {
  hidden: { opacity: 0, x: -20, scale: 0.95 },
  visible: {
    opacity: 1, x: 0, scale: 1,
    transition: { duration: 0.35, ease: [0.33, 1, 0.68, 1] as Easing }
  }
}

// ============================================
// Streaming Cursor
// ============================================

function StreamingCursor() {
  return (
    <motion.div
      animate={{ opacity: [0.4, 1, 0.4] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      className="inline-flex items-center gap-1"
    >
      <span className="text-sm font-medium" style={{ color: CLAUDE_AVATAR_BG }}>
        Thinking
      </span>
      <motion.div
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
        className="flex gap-0.5"
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CLAUDE_AVATAR_BG }} />
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CLAUDE_AVATAR_BG }} />
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CLAUDE_AVATAR_BG }} />
      </motion.div>
    </motion.div>
  )
}

// ============================================
// User Avatar
// ============================================

function UserAvatar({ avatar }: { avatar?: string }) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt="User avatar"
        className="w-7 h-7 rounded-full object-cover"
      />
    )
  }

  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center"
      style={{ backgroundColor: slateColors[200] }}
    >
      <User className="w-3.5 h-3.5" style={{ color: slateColors[500] }} />
    </div>
  )
}

// ============================================
// AI Avatar - Smaller, aligned
// ============================================

function AIAvatar() {
  return (
    <div
      className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0"
      style={{ backgroundColor: CLAUDE_AVATAR_BG }}
    >
      <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
    </div>
  )
}

// ============================================
// Copy Button - Subtle, shows on hover
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
      console.error("Copy failed:", err)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded text-xs transition-all duration-200 min-h-9 touch-manipulation",
        "opacity-100 md:opacity-0 md:group-hover:opacity-100",
        copied
          ? "text-emerald-600 bg-emerald-50"
          : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
      )}
    >
      {copied ? (
        <>
          <Check className="w-3 h-3" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  )
}

// ============================================
// Timestamp
// ============================================

function Timestamp({ date }: { date: Date }) {
  const formatted = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <span
      className="text-xs"
      style={{ color: slateColors[400] }}
    >
      {formatted}
    </span>
  )
}

// ============================================
// Markdown Content - Clean typography
// ============================================

// 检测内容是否包含 LaTeX 公式
const HAS_LATEX_REGEX = /\$[^$]+\$|\$\$[\s\S]+?\$\$/;

// 仅当内容包含公式时才加载 math 插件，节省解析开销
function MarkdownContent({ content }: { content: string }) {
  const mathPlugins = useMemo(() => {
    return HAS_LATEX_REGEX.test(content) ? [remarkMath] : []
  }, [content])

  const rehypePlugins = useMemo(() => {
    return HAS_LATEX_REGEX.test(content) ? [rehypeKatex] : []
  }, [content])

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, ...mathPlugins]}
      rehypePlugins={rehypePlugins}
      components={{
        p: ({ children }) => {
          const textContent = getTextContent(children)
          const isConclusionPara = isConclusionParagraph(textContent)

          if (isConclusionPara) {
              return (
                <p
                  className="mb-1.5 last:mb-0 rounded-r text-[13px] sm:text-[14px]"
                  style={{
                    lineHeight: 1.6,
                    color: CLAUDE_TEXT_COLOR,
                    backgroundColor: "rgba(16, 185, 129, 0.08)",
                    borderLeft: "3px solid #10B981",
                  borderRadius: "0 6px 6px 0",
                  padding: "6px 10px",
                }}
              >
                {children}
              </p>
            )
          }

          return (
            <p className="mb-1.5 last:mb-0 text-[13px] sm:text-[14px]" style={{ lineHeight: 1.6, color: CLAUDE_TEXT_COLOR }}>
              {children}
            </p>
          )
        },
        ul: ({ children }) => (
          <ul className="list-disc pl-5 mb-1.5 space-y-0" style={{ lineHeight: 1.6 }}>
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-5 mb-1.5 space-y-0" style={{ lineHeight: 1.6 }}>
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="text-[13px] sm:text-[14px]" style={{ lineHeight: 1.6, color: CLAUDE_TEXT_COLOR }}>
            {children}
          </li>
        ),
        code: ({ children, className }) => {
          const isInline = !className
          if (isInline) {
            return (
              <code
                className="px-1.5 py-0.5 rounded text-[12px] sm:text-[13px]"
                style={{
                  backgroundColor: slateColors[100],
                  color: CLAUDE_ACCENT_COLOR
                }}
              >
                {children}
              </code>
            )
          }
          return (
            <code className={cn("block p-2.5 sm:p-4 rounded-lg text-[12px] sm:text-sm overflow-x-auto mb-2.5", className)}>
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
        strong: ({ children }) => (
          <strong className="font-semibold" style={{ color: CLAUDE_TEXT_COLOR }}>
            {children}
          </strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            style={{ color: CLAUDE_ACCENT_COLOR }}
          >
            {children}
          </a>
        ),
        h1: ({ children }) => (
          <h1
            className="font-bold text-[14px] sm:text-base mt-2 mb-1"
            style={{ color: "#111827", lineHeight: 1.4 }}
          >
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2
            className="font-semibold text-[13px] sm:text-sm mt-1.5 mb-0.5"
            style={{ color: "#111827", lineHeight: 1.4 }}
          >
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3
            className="font-medium text-[12px] sm:text-sm mt-1.5 mb-0.5"
            style={{ color: "#6B7280", lineHeight: 1.4 }}
          >
            {children}
          </h3>
        ),
        h4: ({ children }) => (
          <h4
            className="text-[12px] sm:text-sm font-semibold pl-2 border-l-2 mt-1.5 mb-0.5"
            style={{ color: "#111827", borderColor: CLAUDE_ACCENT_COLOR, lineHeight: 1.4 }}
          >
            {children}
          </h4>
        ),
        blockquote: ({ children }) => (
          <blockquote
            className="border-l-4 px-3 py-1.5 my-1 rounded-r"
            style={{
              borderColor: CLAUDE_ACCENT_COLOR,
              backgroundColor: slateColors[50],
              lineHeight: 1.55
            }}
          >
            {children}
          </blockquote>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

// ============================================
// Main Component
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

  // User message style - transparent background, inherits page text color
  const userBubbleStyle = {
    backgroundColor: "#f7f7f5",
    color: "#2f3136",
    border: "1px solid #e6e3dc",
    borderRadius: "18px 4px 18px 18px",
    maxWidth: "75%",
  }

  // AI message style - Flat, minimal, almost no container
  const assistantBubbleStyle = {
    backgroundColor: "transparent",
    color: CLAUDE_TEXT_COLOR,
    borderRadius: "0",
    maxWidth: "88%",
  }

  return (
    <motion.div
      variants={isUser ? userMessageVariants : assistantMessageVariants}
      initial="hidden"
      animate="visible"
      className={cn(
        "flex gap-2.5 sm:gap-3 group",
        isUser ? "flex-row-reverse" : "flex-row",
        className
      )}
    >
      {/* AI 流式输出中：仅显示 Thinking 动画，无头像无气泡 */}
      {isStreaming && !isUser ? (
        <div className="flex items-center py-2">
          <StreamingCursor />
        </div>
      ) : (
        <>
          {/* Avatar */}
          <div className="flex-shrink-0 mt-1">
            {isUser ? <UserAvatar avatar={avatar} /> : <AIAvatar />}
          </div>

          {/* Message Content */}
          <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
            {/* Flat bubble without heavy container styling */}
            <div
              className={cn(
                isUser ? "px-3 py-2.5 sm:px-4 sm:py-3 shadow-sm" : "px-0.5 py-0.5 sm:px-1 ai-message-bubble",
              )}
              style={isUser ? userBubbleStyle : assistantBubbleStyle}
            >
              {isUser ? (
                <p
                  className="whitespace-pre-wrap break-words text-[13px] sm:text-sm"
                  style={{ lineHeight: 1.6 }}
                >
                  {content}
                </p>
              ) : (
                <div
                  className="text-[13px] sm:text-sm ai-content-container"
                  style={{ lineHeight: 1.6, color: CLAUDE_TEXT_COLOR }}
                >
                  <MarkdownContent content={content} />
                </div>
              )}
            </div>

            {/* Bottom action bar - Hidden by default, shows on hover */}
            <div
              className={cn(
                "flex flex-wrap items-center gap-2 mt-1 px-1",
                "opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200",
                isUser ? "flex-row-reverse" : "flex-row"
              )}
            >
              {timestamp && <Timestamp date={timestamp} />}

              {/* Copy button for AI messages */}
              {!isUser && !isStreaming && content && (
                <CopyButton content={content} onCopy={onCopy} />
              )}
            </div>
          </div>
        </>
      )}
    </motion.div>
  )
})

export { MessageBubble }
export default MessageBubble
