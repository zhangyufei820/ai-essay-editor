/* eslint-disable @next/next/no-img-element -- Dynamic/user-generated/external image surfaces: keep native img to preserve sizing, blob/data/proxy URLs, payment QR codes, and chat preview behavior. */
/**
 * 💬 Message Bubble Component - Claude Style
 *
 * Refactored to match Claude.ai's visual style:
 * - Flat, minimal container design
 * - Subtle action toolbar (show on hover)
 * - Clean typography with proper line-height
 */

"use client"

import { memo, useEffect, useMemo, useRef, useState } from "react"
import { motion, type Easing } from "framer-motion"
import { ChevronDown, ChevronUp, Copy, FileDown, MessageCircle, Share2, Sparkles, User, Volume2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { AssistantMessageV2 } from "@/components/chat/v2"
import { EssayReviewTemplate } from "@/components/chat/v2/templates"
import { InkBrush } from "@/components/motion/InkMotion"
import { parseEssayReview } from "@/lib/parse-essay-review"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"

// v2 墨砚 token colors
const CLAUDE_TEXT_COLOR = "var(--ink-700)"
const CLAUDE_SECONDARY_COLOR = "var(--ink-500)"
const CLAUDE_ACCENT_COLOR = "var(--seal-500)"
const CLAUDE_AVATAR_BG = "var(--ink-600)"
const MAX_VISIBLE_HEIGHT = 600

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
  model?: string
  showAvatar?: boolean
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
      style={{ backgroundColor: "var(--paper-200)" }}
    >
      <User className="w-3.5 h-3.5" style={{ color: "var(--ink-500)" }} />
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
      style={{ color: "var(--ink-400)" }}
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
                  className="my-3 rounded-r-[var(--radius-soft)] border-l-[3px] border-[var(--seal-500)] bg-[var(--seal-50)]/60 px-4 py-3 text-[13px] sm:text-[14px]"
                  style={{
                    lineHeight: 1.6,
                    color: CLAUDE_TEXT_COLOR,
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
                  backgroundColor: "var(--paper-100)",
                  color: CLAUDE_ACCENT_COLOR
                }}
              >
                {children}
              </code>
            )
          }
          return (
            <code className={cn("block p-2.5 sm:p-4 rounded-[var(--radius-soft)] text-[12px] sm:text-sm overflow-x-auto mb-2.5", className)}>
              {children}
            </code>
          )
        },
        pre: ({ children }) => (
          <pre
            className="rounded-[var(--radius-soft)] overflow-hidden mb-2"
            style={{ backgroundColor: "var(--ink-900)" }}
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
            style={{ color: "var(--ink-900)", lineHeight: 1.4 }}
          >
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2
            className="font-semibold text-[13px] sm:text-sm mt-1.5 mb-0.5"
            style={{ color: "var(--ink-900)", lineHeight: 1.4 }}
          >
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3
            className="font-medium text-[12px] sm:text-sm mt-1.5 mb-0.5"
            style={{ color: "var(--ink-500)", lineHeight: 1.4 }}
          >
            {children}
          </h3>
        ),
        h4: ({ children }) => (
          <h4
            className="text-[12px] sm:text-sm font-semibold pl-2 border-l-2 mt-1.5 mb-0.5"
            style={{ color: "var(--ink-900)", borderColor: CLAUDE_ACCENT_COLOR, lineHeight: 1.4 }}
          >
            {children}
          </h4>
        ),
        blockquote: ({ children }) => (
          <blockquote
            className="border-l-4 px-3 py-1.5 my-1 rounded-r"
            style={{
              borderColor: CLAUDE_ACCENT_COLOR,
              backgroundColor: "var(--paper-50)",
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

interface MessageActions {
  onCopy: () => void
  onExportPDF: () => void
  onShare: () => void
  onAskFollowup: () => void
  onPlayAudio: () => void
}

function MessageActionToolbar({ actions }: { actions: MessageActions }) {
  const buttons = [
    { label: "复制", icon: Copy, onClick: actions.onCopy },
    { label: "朗读", icon: Volume2, onClick: actions.onPlayAudio },
    { label: "分享", icon: Share2, onClick: actions.onShare },
    { label: "导出 PDF", icon: FileDown, onClick: actions.onExportPDF },
    { label: "继续追问", icon: MessageCircle, onClick: actions.onAskFollowup },
  ] as const

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--paper-200)] bg-[var(--paper-50)] px-4 py-3 sm:px-6">
      {buttons.map(({ label, icon: Icon, onClick }) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--ink-600)] transition-colors hover:bg-[var(--ink-50)] hover:text-[var(--ink-800)] focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus-ink)]"
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )
}

function AssistantMarkdownCard({
  content,
  actions,
  templateType,
}: {
  content: string
  actions: MessageActions
  templateType: string
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(true)
  const [isLong, setIsLong] = useState(false)

  useEffect(() => {
    setCollapsed(true)
    const frame = requestAnimationFrame(() => {
      setIsLong((contentRef.current?.scrollHeight ?? 0) > MAX_VISIBLE_HEIGHT)
    })
    return () => cancelAnimationFrame(frame)
  }, [content])

  return (
    <article
      data-slot="v2-message-bubble-markdown"
      data-template={templateType}
      className="w-full max-w-3xl overflow-hidden rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-white text-[var(--ink-900)] shadow-[var(--shadow-paper)]"
    >
      <div
        ref={contentRef}
        className="relative px-5 py-5 sm:px-8 sm:py-7"
        style={isLong && collapsed ? { maxHeight: MAX_VISIBLE_HEIGHT, overflow: "hidden" } : undefined}
      >
        <div
          className="text-[13px] sm:text-sm ai-content-container"
          style={{ lineHeight: 1.6, color: CLAUDE_TEXT_COLOR }}
        >
          <MarkdownContent content={content} />
        </div>
      </div>

      {isLong ? (
        <div className="relative border-t border-[var(--paper-200)] bg-white px-5 sm:px-8">
          {collapsed ? (
            <div className="pointer-events-none absolute inset-x-0 -top-20 h-20 bg-gradient-to-t from-white to-transparent" />
          ) : null}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="relative z-10 flex w-full items-center justify-center gap-1.5 py-2 text-[13px] font-medium text-[var(--ink-600)] transition-colors hover:text-[var(--ink-800)] focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus-ink)]"
          >
            {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
            {collapsed ? "展开全文" : "收起"}
          </button>
        </div>
      ) : null}

      <MessageActionToolbar actions={actions} />
    </article>
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
  model,
  showAvatar = true,
}: MessageBubbleProps) {
  const isUser = role === "user"
  const essayReviewArtifact = useMemo(() => {
    const isEssayModel = model === "standard" || model === "essay-correction"
    if (isUser || !isEssayModel) return null
    return parseEssayReview(content)
  }, [content, isUser, model])
  const templateType = useMemo(() => {
    if (isUser) return "user"
    if (essayReviewArtifact) return "essay-review"
    // Future extension points:
    // if (model === "vocab-card") return "vocab-card"
    // if (model === "suno-v5") return "music-card"
    // if (model?.includes("gpt-image") || model === "banana-2-pro") return "image-gallery"
    return "markdown"
  }, [essayReviewArtifact, isUser, model])
  const actions = useMemo<MessageActions>(() => ({
    onCopy: async () => {
      try {
        await navigator.clipboard.writeText(content)
        onCopy?.()
      } catch (err) {
        console.error("Copy failed:", err)
      }
    },
    onExportPDF: () => {
      window.print()
    },
    onShare: () => {
      if (navigator.share) {
        navigator.share({ title: "沈翔智学 AI 回复", text: content.slice(0, 200) }).catch(() => {})
      }
    },
    onAskFollowup: () => {
      window.dispatchEvent(new Event("focus-chat-input"))
    },
    onPlayAudio: () => {
      window.dispatchEvent(new CustomEvent("play-chat-message-audio", { detail: { text: content } }))
    },
  }), [content, onCopy])

  // User message style - transparent background, inherits page text color
  const userBubbleStyle = {
    backgroundColor: "var(--ink-700)",
    color: "white",
    border: "1px solid var(--ink-700)",
    borderRadius: "var(--radius-soft)",
    maxWidth: "75%",
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
      {/* AI 流式输出中：空内容显示毛笔思考，有内容则正常渲染并追加笔触指示 */}
      {isStreaming && !isUser && !content ? (
        <div className="flex items-center gap-3 px-4 py-4">
          {showAvatar ? (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ink-600)]">
              <Sparkles className="size-3.5 text-white" />
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <InkBrush className="h-4 w-20 text-[var(--ink-500)]" />
            <span className="text-[12px] text-[var(--ink-400)] font-[var(--font-sans-v2)]">
              AI 正在组织回复...
            </span>
          </div>
        </div>
      ) : isStreaming && !isUser && content ? (
        <>
          {showAvatar ? (
            <div className="flex-shrink-0 mt-1">
              <AIAvatar />
            </div>
          ) : null}
          <div className="flex flex-1 flex-col items-start">
            <AssistantMessageV2
              message={{
                id: "streaming",
                role: "assistant",
                content,
                streaming: true,
                model,
              }}
              renderMarkdown={() => (
                <div
                  className="text-[13px] sm:text-sm ai-content-container"
                  style={{ lineHeight: 1.6, color: CLAUDE_TEXT_COLOR }}
                >
                  <MarkdownContent content={content} />
                </div>
              )}
            />
            <div className="mt-2 flex items-center gap-2 px-1">
              <InkBrush className="h-3 w-12 text-[var(--ink-400)]" />
              <span className="text-[11px] text-[var(--ink-400)] font-[var(--font-mono-v2)]">
                生成中...
              </span>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Avatar */}
          {showAvatar ? (
            <div className="flex-shrink-0 mt-1">
              {isUser ? <UserAvatar avatar={avatar} /> : <AIAvatar />}
            </div>
          ) : null}

          {/* Message Content */}
          <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
            {isUser ? (
              <div
                className="px-3 py-2.5 sm:px-4 sm:py-3 shadow-[var(--shadow-paper)]"
                style={userBubbleStyle}
              >
                <p
                  className="whitespace-pre-wrap break-words text-[13px] sm:text-sm"
                  style={{ lineHeight: 1.6 }}
                >
                  {content}
                </p>
              </div>
            ) : (
              essayReviewArtifact ? (
                <EssayReviewTemplate
                  artifact={essayReviewArtifact}
                  onCopy={actions.onCopy}
                  onExportPDF={actions.onExportPDF}
                  onShare={actions.onShare}
                  onAskFollowup={actions.onAskFollowup}
                />
              ) : (
                <AssistantMarkdownCard
                  content={content}
                  actions={actions}
                  templateType={templateType}
                />
              )
            )}

            {/* Bottom action bar - Hidden by default, shows on hover */}
            {isUser ? (
              <div
                className="flex flex-row-reverse flex-wrap items-center gap-2 mt-1 px-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200"
              >
                {timestamp && <Timestamp date={timestamp} />}
              </div>
            ) : null}
          </div>
        </>
      )}
    </motion.div>
  )
})

export { MessageBubble }
export default MessageBubble
