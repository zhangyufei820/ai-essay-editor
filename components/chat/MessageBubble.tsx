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
import { ChevronDown, ChevronUp } from "lucide-react"
import { IconAllInOne, IconCopy, IconExportPdf, IconFollowup, IconHistory, IconListen, IconShare, IconUser } from "@/components/icons/v2"
import { cn } from "@/lib/utils"
import { AssistantMessageV2 } from "@/components/chat/v2"
import {
  EssayReviewTemplate,
  FlashcardTemplate,
  VocabCardTemplate,
  WorksheetPosterTemplate,
} from "@/components/chat/v2/templates"
import type { FlashcardArtifact, VocabCardArtifact, WorksheetDiagnosisArtifact } from "@/components/chat/v2/types"
import { exportChatContentToPDF } from "@/lib/chat-pdf-export"
import { InkBrush } from "@/components/motion/InkMotion"
import { parseEssayReview } from "@/lib/parse-essay-review"
import { splitThinkingContent } from "@/lib/think-content"
import { toast } from "sonner"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"

// v2 墨砚 token colors
const AI_TEXT_COLOR = "var(--ink-800)"
const CLAUDE_SECONDARY_COLOR = "var(--ink-500)"
const CLAUDE_ACCENT_COLOR = "var(--ink-700)"
const MAX_VISIBLE_HEIGHT = 600

// Conclusion detection - hoisted to module scope to avoid recreation per render
const CONCLUSION_KEYWORDS = ["综上所述", "答案是", "结论是", "所以", "因此", "总之", "故", "可得"] as const

function isConclusionParagraph(text: string): boolean {
  return CONCLUSION_KEYWORDS.some(keyword => text.includes(keyword))
}

function parseLineList(block: string) {
  return block
    .split("\n")
    .map((line) => line.replace(/^[\s\-*•\d.、)）]+/, "").trim())
    .filter(Boolean)
}

function parseVocabCard(content: string): VocabCardArtifact | null {
  const word = content.match(/^#+\s*(\S+)/m)?.[1] || content.match(/单词[：:]\s*(\S+)/)?.[1] || ""
  if (!word) return null

  const examplesBlock = content.match(/例句[：:][\s\S]*?(?=\n#|\n\n|$)/)?.[0] || ""

  return {
    type: "vocab-card",
    word,
    meaning: content.match(/释义[：:]\s*([^\n]+)/)?.[1]?.trim() || "",
    pronunciation: content.match(/音标[：:]\s*([^\n]+)/)?.[1]?.trim() || "",
    examples: parseLineList(examplesBlock).slice(0, 5),
    story: content.match(/(?:记忆故事|记忆|故事)[：:]\s*([\s\S]*?)(?=\n#|$)/)?.[1]?.trim() || "",
    raw: content,
  }
}

function parseWorksheetPoster(content: string): WorksheetDiagnosisArtifact {
  const weakBlock = content.match(/(?:薄弱点|错题|弱点)[：:：]?\s*([\s\S]*?)(?=\n#|\n\n(?:训练|计划)|$)/)?.[1] || ""
  const trainingBlock = content.match(/(?:训练计划|今日训练|训练)[：:：]?\s*([\s\S]*?)(?=\n#|$)/)?.[1] || ""

  return {
    type: "worksheet-diagnosis",
    subject: content.match(/科目[：:]\s*([^\n]+)/)?.[1]?.trim(),
    grade: content.match(/年级[：:]\s*([^\n]+)/)?.[1]?.trim(),
    totalQuestions: Number(content.match(/总题数[：:]\s*(\d+)/)?.[1]) || undefined,
    wrongCount: Number(content.match(/(?:错题|错误)[：:]\s*(\d+)/)?.[1]) || undefined,
    weakPoints: parseLineList(weakBlock).slice(0, 5).map((topic) => ({
      topic,
      wrongOf: content.match(/(?:错|错误)\s*(\d+\s*\/\s*\d+|\d+)/)?.[1] || "—",
    })),
    trainingPlan: parseLineList(trainingBlock).length
      ? [{ topic: "今日训练", tasks: parseLineList(trainingBlock).slice(0, 6) }]
      : undefined,
    rawMarkdown: content,
  }
}

function parseFlashcards(content: string): FlashcardArtifact | null {
  const cards = [...content.matchAll(/(?:^|\n)[-*]\s*(.+?)\s*(?:=>|->|：|:)\s*(.+?)(?=\n|$)/g)]
    .map((match) => ({ front: match[1].trim(), back: match[2].trim() }))
    .filter((card) => card.front && card.back)

  return cards.length ? { type: "flashcard", cards: cards.slice(0, 20) } : null
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
  onShare?: () => void
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
        className="h-7 w-7 rounded-full object-cover"
      />
    )
  }

  return (
    <div
      className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--paper-200)]"
    >
      <IconUser className="h-3.5 w-3.5 text-[var(--ink-500)]" />
    </div>
  )
}

// ============================================
// AI Avatar - Smaller, aligned
// ============================================

function AIAvatar() {
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ink-700)] sm:h-10 sm:w-10"
    >
      <IconAllInOne className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
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
                  className="my-3 rounded-r-[var(--radius-soft)] border-l-[3px] border-[var(--ink-700)] bg-[var(--ink-50)]/70 px-4 py-3 text-[13px] sm:text-[14px]"
                  style={{
                    lineHeight: 1.6,
                    color: AI_TEXT_COLOR,
                }}
              >
                {children}
              </p>
            )
          }

          return (
            <p className="mb-1.5 last:mb-0 text-[13px] sm:text-[14px]" style={{ lineHeight: 1.6, color: AI_TEXT_COLOR }}>
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
          <li className="text-[13px] sm:text-[14px]" style={{ lineHeight: 1.6, color: AI_TEXT_COLOR }}>
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
          <strong className="font-semibold" style={{ color: AI_TEXT_COLOR }}>
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
  onRegenerate: () => void
}

function MessageActionToolbar({ actions }: { actions: MessageActions }) {
  const buttons = [
    { label: "复制", icon: IconCopy, onClick: actions.onCopy },
    { label: "朗读", icon: IconListen, onClick: actions.onPlayAudio },
    { label: "分享", icon: IconShare, onClick: actions.onShare },
    { label: "导出 PDF", icon: IconExportPdf, onClick: actions.onExportPDF },
    { label: "继续追问", icon: IconFollowup, onClick: actions.onAskFollowup },
    { label: "重新生成", icon: IconHistory, onClick: actions.onRegenerate },
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

function ShareRewardCallout({ onShare }: { onShare: () => void }) {
  return (
    <div className="border-t border-[var(--paper-200)] bg-[linear-gradient(135deg,var(--ink-50),var(--paper-50))] px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-3 rounded-[var(--radius-sharp)] border border-[var(--ink-200)] bg-white/82 p-4 shadow-[0_10px_28px_rgba(63,90,66,0.12)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--seal-50)] px-3 py-1 text-[12px] font-semibold text-[var(--seal-600)]">
            <IconShare className="size-3.5" aria-hidden="true" />
            长文分享 +10 积分
          </div>
          <p className="mt-2 text-[13px] leading-6 text-[var(--ink-700)]">
            把这份高质量回答分享到创作广场，让更多同学参考，也为你的账户赚取积分奖励。
          </p>
        </div>
        <button
          type="button"
          onClick={onShare}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--ink-700)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(63,90,66,0.22)] transition-colors hover:bg-[var(--ink-800)] focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus-ink)]"
        >
          <IconShare className="size-4" aria-hidden="true" />
          分享到广场
        </button>
      </div>
    </div>
  )
}

function ThinkingDisclosure({
  content,
  isStreaming,
}: {
  content: string
  isStreaming?: boolean
}) {
  const [open, setOpen] = useState(Boolean(isStreaming))

  return (
    <div className="mb-4 overflow-hidden rounded-[var(--radius-soft)] border border-[var(--ink-100)] bg-[var(--ink-50)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[13px] font-semibold text-[var(--ink-700)] transition-colors hover:bg-[var(--ink-50)] focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus-ink)]"
      >
        <span className="inline-flex items-center gap-2">
          <IconAllInOne className="size-3.5" aria-hidden="true" />
          思考过程
          {isStreaming ? <span className="text-[11px] text-[var(--ink-400)]">生成中</span> : null}
        </span>
        {open ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
      </button>
      {open ? (
        <div className="border-t border-[var(--ink-100)] px-4 py-3 text-[12px] leading-6 text-[var(--ink-600)]">
          <MarkdownContent content={content} />
        </div>
      ) : null}
    </div>
  )
}

function AssistantMarkdownCard({
  content,
  actions,
  templateType,
  isStreaming,
}: {
  content: string
  actions: MessageActions
  templateType: string
  isStreaming?: boolean
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(true)
  const [isLong, setIsLong] = useState(false)
  const parsedContent = useMemo(() => splitThinkingContent(content), [content])
  const answerContent = parsedContent.answer || (parsedContent.hasOpenThinking ? "" : content)

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
      className="w-full max-w-none overflow-hidden rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-white text-[var(--ink-900)] shadow-[var(--shadow-paper)]"
    >
      <div
        ref={contentRef}
        className="relative px-5 py-5 sm:px-8 sm:py-7"
        style={isLong && collapsed ? { maxHeight: MAX_VISIBLE_HEIGHT, overflow: "hidden" } : undefined}
      >
        <div
          className="text-[13px] sm:text-sm ai-content-container"
          style={{ lineHeight: 1.6, color: AI_TEXT_COLOR }}
        >
          {parsedContent.hasThinking ? (
            <ThinkingDisclosure
              content={parsedContent.thinking}
              isStreaming={isStreaming && parsedContent.hasOpenThinking}
            />
          ) : null}
          {answerContent ? (
            <div>
              {parsedContent.hasThinking ? (
                <div className="mb-3 inline-flex rounded-[var(--radius-pill)] border border-[var(--paper-200)] bg-[var(--paper-100)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-500)]">
                  正式回答
                </div>
              ) : null}
              <MarkdownContent content={answerContent} />
            </div>
          ) : isStreaming ? (
            <span className="text-[var(--ink-500)]">正在整理正式回答...</span>
          ) : null}
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

      {!isStreaming ? <ShareRewardCallout onShare={actions.onShare} /> : null}
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
  onShare,
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
    if (model === "vocab-card") return "vocab-card"
    if (model === "flashcard") return "flashcard"
    if (model === "suno-v5") return "music-card"
    if (model?.includes("gpt-image") || model === "banana-2-pro" || model === "gemini-image") return "image-gallery"
    if (model === "worksheet-diagnosis") return "worksheet-poster"
    return "markdown"
  }, [essayReviewArtifact, isUser, model])
  const vocabCardArtifact = useMemo(
    () => templateType === "vocab-card" ? parseVocabCard(content) : null,
    [content, templateType]
  )
  const flashcardArtifact = useMemo(
    () => templateType === "flashcard" ? parseFlashcards(content) : null,
    [content, templateType]
  )
  const actions = useMemo<MessageActions>(() => ({
    onCopy: async () => {
      try {
        await navigator.clipboard.writeText(content)
        onCopy?.()
      } catch (err) {
        console.error("Copy failed:", err)
      }
    },
    onExportPDF: async () => {
      try {
        toast.info("正在生成完整 PDF...")
        await exportChatContentToPDF(content, {
          title: essayReviewArtifact ? "沈翔智学 - 作文批改报告" : "沈翔智学 - AI 分析报告",
          filenamePrefix: essayReviewArtifact ? "沈翔智学-作文批改报告" : "沈翔智学-AI分析报告",
        })
        toast.success("PDF 已生成")
      } catch (err) {
        console.error("PDF export failed:", err)
        toast.error("PDF 导出失败，请重试")
      }
    },
    onShare: () => {
      if (onShare) {
        onShare()
        return
      }
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
    onRegenerate: () => {
      window.dispatchEvent(new CustomEvent("regenerate-last-message"))
    },
  }), [content, essayReviewArtifact, onCopy, onShare])

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
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ink-700)]">
              <IconAllInOne className="size-3.5 text-white" />
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
                  style={{ lineHeight: 1.6, color: AI_TEXT_COLOR }}
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
          <div className={cn("flex flex-col", isUser ? "items-end" : "w-full items-start")}>
            {isUser ? (
              <div className="max-w-[75%] rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--ink-50)] px-4 py-3 text-[var(--ink-800)] shadow-sm">
                <p
                  className="whitespace-pre-wrap break-words text-[13px] sm:text-sm"
                  style={{ lineHeight: 1.6 }}
                >
                  {content}
                </p>
              </div>
            ) : (
              (() => {
                switch (templateType) {
                  case "essay-review":
                    return (
                      <div className="w-full max-w-none overflow-hidden rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-white shadow-[var(--shadow-paper)]">
                        <EssayReviewTemplate
                          artifact={essayReviewArtifact!}
                          onCopy={actions.onCopy}
                          onExportPDF={actions.onExportPDF}
                          onShare={actions.onShare}
                          onAskFollowup={actions.onAskFollowup}
                        />
                        {!isStreaming ? <ShareRewardCallout onShare={actions.onShare} /> : null}
                      </div>
                    )
                  case "vocab-card":
                    return vocabCardArtifact ? (
                      <VocabCardTemplate
                        artifact={vocabCardArtifact}
                        onPlayAudio={actions.onPlayAudio}
                      />
                    ) : (
                      <AssistantMarkdownCard content={content} actions={actions} templateType={templateType} isStreaming={isStreaming} />
                    )
                  case "worksheet-poster":
                    return (
                      <WorksheetPosterTemplate
                        artifact={parseWorksheetPoster(content)}
                        onDownload={actions.onExportPDF}
                        onShare={actions.onShare}
                      />
                    )
                  case "flashcard":
                    return flashcardArtifact ? (
                      <FlashcardTemplate artifact={flashcardArtifact} />
                    ) : (
                      <AssistantMarkdownCard content={content} actions={actions} templateType={templateType} isStreaming={isStreaming} />
                    )
                  case "music-card":
                  case "image-gallery":
                  default:
                    return <AssistantMarkdownCard content={content} actions={actions} templateType={templateType} isStreaming={isStreaming} />
                }
              })()
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
