"use client"
/* eslint-disable @next/next/no-img-element -- Dynamic/user-generated/external image surfaces: keep native img to preserve sizing, blob/data/proxy URLs, payment QR codes, and chat preview behavior. */

/**
 * 增强的 Markdown 渲染组件
 *
 * 特性：
 * - 使用 react-markdown 解析标准 Markdown
 * - react-syntax-highlighter 实现代码高亮
 * - 静奢风极简美学（行距 1.6-1.75，文字 #333）
 * - 行内代码样式（灰色背景、等宽字体）
 * - 代码块复制按钮
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { IconEssay, IconExportPdf } from "@/components/icons/v2"
import { Children, isValidElement, memo, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { proxifyGeneratedImagePreviewUrl } from '@/components/chat/image-generation/gpt-image-v11'
import { OpenClawHtmlPreview } from '@/components/chat/OpenClawHtmlPreview'
import { getOpenClawAttachmentKind, isLikelyHtmlDocumentUrl, rewriteOpenClawMediaReferences } from '@/lib/openclaw-media'
import { MarkdownCodeBlock, extractLanguageFromClassName } from '@/components/chat/MarkdownCodeBlock'

// 静奢风配色
const TEXT_COLOR = "#333333"
const SECONDARY_COLOR = "#666666"
const INLINE_CODE_BG = "#f0f0f0"
const BORDER_COLOR = "#e5e5e5"

interface EnhancedMarkdownProps {
  content: string
  className?: string
}

function normalizeMathDelimiters(text: string) {
  return text
    .replace(/\\\[/g, "\n$$\n")
    .replace(/\\\]/g, "\n$$\n")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$")
}

function stripOpenClawDownloadLinks(text: string) {
  return text
    .replace(/^\s*(?:[📄📎⬇️🔗]\s*)?\[([^\]]*(?:下载\s*Word|Word\s*格式|下载文档|下载文件)[^\]]*)\]\(([^)]*(?:\/api\/openclaw-media|\/api\/openclaw-media-sign|__openclaw__)[^)]*)\)\s*$/gim, "")
    .replace(/^\s*(?:[📄📎⬇️🔗]\s*)?\[([^\]]+)\]\(([^)]*(?:\/api\/openclaw-media|\/api\/openclaw-media-sign|__openclaw__)[^)]*\.(?:docx?|pdf)(?:[?#][^)]*)?)\)\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function withDownloadParam(url: string): string {
  const hashIndex = url.indexOf("#")
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : ""
  const separator = base.includes("?") ? "&" : "?"
  return `${base}${separator}download=1${hash}`
}

function MarkdownFileCard({ src, alt }: { src: string; alt?: string }) {
  const label = alt?.trim() || safeDecodeURIComponent(src.split("/").pop()?.split(/[?#]/, 1)[0] || "打开文件")

  return (
    <a
      href={withDownloadParam(src)}
      download={label}
      target="_blank"
      rel="noopener noreferrer"
      className="my-3 flex max-w-full items-center gap-3 rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] px-3 py-2.5 text-[var(--ink-700)] no-underline transition-colors hover:bg-[var(--paper-100)]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--paper-50)] text-[var(--ink-500)]">
        <IconEssay className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-[var(--ink-500)]">{src}</span>
      </span>
      <IconExportPdf className="h-4 w-4 shrink-0 text-[var(--ink-400)]" />
    </a>
  )
}

function childrenToText(children: React.ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children)
  if (Array.isArray(children)) return children.map(childrenToText).join("")
  return ""
}

function containsOpenClawHtmlPreview(children: React.ReactNode) {
  return Children.toArray(children).some((child) => (
    isValidElement(child) && child.type === OpenClawHtmlPreview
  ))
}

export const EnhancedMarkdown = memo(function EnhancedMarkdown({ content, className }: EnhancedMarkdownProps) {
  const normalizedContent = useMemo(
    () => stripOpenClawDownloadLinks(normalizeMathDelimiters(rewriteOpenClawMediaReferences(content))),
    [content],
  )

  return (
    <div
      className={cn(
        "markdown-body max-w-none overflow-hidden text-[14px] leading-7 sm:text-[15px]",
        "[&_p:last-child]:mb-0",
        className,
      )}
      style={{
        color: TEXT_COLOR,
        lineHeight: 1.72,
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // 标题样式
	          h1: ({ children }) => (
	            <h1 className="mb-3 mt-6 border-b border-[var(--paper-200)] pb-2 text-xl font-bold sm:mb-4 sm:mt-8 sm:text-2xl" style={{ color: TEXT_COLOR, lineHeight: 1.35 }}>
	              {children}
	            </h1>
	          ),
	          h2: ({ children }) => (
	            <h2 className="mb-2.5 mt-5 border-l-4 border-[var(--ink-700)] pl-3 text-lg font-semibold sm:mb-3 sm:mt-7 sm:text-xl" style={{ color: TEXT_COLOR, lineHeight: 1.4 }}>
	              {children}
	            </h2>
	          ),
	          h3: ({ children }) => (
	            <h3 className="mb-2 mt-4 text-base font-semibold sm:mt-5 sm:text-lg" style={{ color: TEXT_COLOR, lineHeight: 1.4 }}>
	              {children}
	            </h3>
	          ),
          h4: ({ children }) => (
            <h4 className="text-[12px] sm:text-sm font-semibold mb-1.5 mt-2.5 sm:mt-3" style={{ color: TEXT_COLOR, lineHeight: 1.4 }}>
              {children}
            </h4>
          ),

          // 段落和文本
          p: ({ children }) => {
            if (containsOpenClawHtmlPreview(children)) {
              return <>{children}</>
            }

            return (
	              <p className="mb-3 leading-7 text-[var(--ink-700)] sm:mb-3.5" style={{ lineHeight: 1.72 }}>
	                {children}
	              </p>
            )
          },

          // 链接
          a: ({ href, children }) => {
            const rawHref = href ? String(href) : ""
            const label = childrenToText(children)

            if (rawHref && isLikelyHtmlDocumentUrl(rawHref)) {
              return <OpenClawHtmlPreview src={rawHref} title={label || undefined} />
            }

            if (rawHref && getOpenClawAttachmentKind(rawHref) === "image") {
              return (
                <img
                  src={proxifyGeneratedImagePreviewUrl(rawHref, 900)}
                  alt={label || "图片"}
                  className="rounded-[var(--radius-sharp)] max-w-full h-auto my-3 sm:my-4 shadow-md"
                  loading="lazy"
                />
              )
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 underline underline-offset-2"
              >
                {children}
              </a>
            )
          },

          // 强调
          strong: ({ children }) => (
            <strong className="font-semibold" style={{ color: TEXT_COLOR }}>
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic" style={{ color: SECONDARY_COLOR }}>
              {children}
            </em>
          ),

          // 列表
          ul: ({ children }) => (
	            <ul className="mb-3 list-disc space-y-1.5 pl-5 sm:mb-4">
	              {children}
	            </ul>
	          ),
	          ol: ({ children }) => (
	            <ol className="mb-3 list-decimal space-y-1.5 pl-5 sm:mb-4">
	              {children}
	            </ol>
	          ),
	          li: ({ children }) => (
	            <li className="pl-1 leading-7 text-[var(--ink-700)]" style={{ lineHeight: 1.72 }}>
	              {children}
	            </li>
          ),

          // 引用
          blockquote: ({ children }) => (
            <blockquote
	              className="my-4 rounded-r-lg border-l-4 bg-[var(--paper-50)] px-3 py-2.5 pl-4 sm:px-4"
              style={{
                borderColor: BORDER_COLOR,
                color: SECONDARY_COLOR,
              }}
            >
              {children}
            </blockquote>
          ),

          // 行内代码
          code: ({ className, children, ...props }) => {
            const rawCode = String(children)
            const codeString = rawCode.replace(/\n$/, '')
            const isInline = !className && !rawCode.includes("\n")
            if (isInline) {
                return (
                  <code
                  className="px-1.5 py-0.5 rounded text-[12px] sm:text-sm font-mono"
                  style={{
                    backgroundColor: INLINE_CODE_BG,
                    color: "#d63384",
                    fontSize: '0.875em',
                  }}
                  {...props}
                >
                  {children}
                </code>
              )
            }
            // 代码块
            const language = extractLanguageFromClassName(className)

            return <MarkdownCodeBlock code={codeString} language={language} />
          },

          // 预格式化代码块
          pre: ({ children }) => (
            <pre className="contents">
              {children}
            </pre>
          ),

          // 水平线
          hr: () => (
            <hr className="my-6 border-[var(--paper-200)]" />
          ),

          // 图片
          img: ({ src, alt }) => {
            const rawSrc = src ? String(src) : ""
            if (!rawSrc) return null

            if (isLikelyHtmlDocumentUrl(rawSrc)) {
              return <OpenClawHtmlPreview src={rawSrc} title={alt || undefined} />
            }

            if (getOpenClawAttachmentKind(rawSrc) !== "image") {
              return <MarkdownFileCard src={rawSrc} alt={alt || undefined} />
            }

            return (
              <img
                src={proxifyGeneratedImagePreviewUrl(rawSrc, 900)}
                alt={alt || '图片'}
                className="rounded-[var(--radius-sharp)] max-w-full h-auto my-3 sm:my-4 shadow-md"
                loading="lazy"
              />
            )
          },

          // 表格
          table: ({ children }) => (
	              <div className="my-4 overflow-x-auto rounded-[var(--radius-soft)] border border-[var(--paper-200)] sm:my-5">
	              <table className="min-w-full divide-y divide-slate-200 text-left">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
	            <thead className="bg-[var(--paper-50)]">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
	            <tbody className="divide-y divide-slate-200 bg-[var(--paper-50)]">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
	            <tr className="transition-colors hover:bg-[var(--paper-50)]">
              {children}
            </tr>
          ),
          th: ({ children }) => (
	            <th className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-[var(--ink-800)]">
              {children}
            </th>
          ),
          td: ({ children }) => (
	            <td className="min-w-[120px] px-4 py-3 align-top text-sm leading-6" style={{ color: SECONDARY_COLOR }}>
              {children}
            </td>
          ),
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  )
})
