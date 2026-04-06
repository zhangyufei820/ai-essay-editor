/**
 * 📝 Ultimate Renderer - Claude Style
 *
 * Refactored to match Claude.ai's visual style:
 * - No left border accents
 * - Clean typography with line-height 1.6
 * - Minimal visual decorations
 * - Flat design
 */

"use client"

import React, { useMemo, memo, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { slateColors } from "@/lib/design-tokens"
import katex from "katex"

// Claude style colors
const CLAUDE_TEXT_COLOR = "#374151"
const CLAUDE_SECONDARY_COLOR = "#6B7280"
const CLAUDE_ACCENT_COLOR = "#10A37F" // 沈翔绿

// ============================================
// Types
// ============================================

interface UltimateRendererProps {
  content: string
  className?: string
}

// ============================================
// Inline Text Renderer
// ============================================

// Helper function to render LaTeX
// KaTeX 常用几何宏（兼容非标准写法）
const LATEX_MACROS: Record<string, string> = {
  "\\vec": "\\mathbf{#1}",
  "\\vb": "\\mathbf{#1}",
  "\\bm": "\\mathbf{#1}",
  "\\abs": "\\left|#1\\right|",
  "\\norm": "\\left\\|#1\\right\\|",
  "\\set": "\\left\\{#1\\right\\}",
  "\\령": "\\langle #1 \\rangle",
  "\\sse": "\\subseteq",
  "\\nse": "\\nsubseteq",
  "\\R": "\\mathbb{R}",
  "\\N": "\\mathbb{N}",
  "\\Z": "\\mathbb{Z}",
  "\\Q": "\\mathbb{Q}",
  "\\C": "\\mathbb{C}",
  "\\lam": "\\lambda",
  "\\Lam": "\\Lambda",
  "\\theta": "\\theta",
  "\\Theta": "\\Theta",
  "\\角": "\\angle",
  "\\三角形": "\\triangle",
  "\\垂直": "\\perp",
  "\\平行": "\\parallel",
  "\\相似": "\\sim",
  "\\全等": "\\cong",
}

function renderLatex(text: string, displayMode: boolean): string {
  try {
    return katex.renderToString(text, {
      displayMode,
      throwOnError: false,
      errorColor: "#B71C1C",
      macros: LATEX_MACROS,
    })
  } catch (e) {
    console.error("KaTeX render error:", e)
    return text
  }
}

// Inline math renderer
const MathInline = memo(function MathInline({ formula }: { formula: string }) {
  const html = useMemo(() => renderLatex(formula, false), [formula])
  return (
    <span
      dangerouslySetInnerHTML={{ __html: html }}
      className="math-inline"
    />
  )
})

// Block math renderer
const MathBlock = memo(function MathBlock({ formula }: { formula: string }) {
  const html = useMemo(() => renderLatex(formula, true), [formula])
  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      className="math-block my-3 overflow-x-auto"
      style={{ display: "block", textAlign: "center" }}
    />
  )
})

const InlineText = memo(function InlineText({ text }: { text: string }) {
  if (!text) return null

  // Split by ** for bold first
  const parts = text.split(/(\*\*[^*]+\*\*)/g)

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          const inner = part.slice(2, -2)
          // Check for inline math $...$
          const mathParts = inner.split(/(\$[^$]+\$)/g)
          if (mathParts.length > 1) {
            return (
              <strong
                key={index}
                className="font-semibold"
                style={{ color: CLAUDE_TEXT_COLOR }}
              >
                {mathParts.map((mp, mi) => {
                  if (mp.startsWith("$") && mp.endsWith("$")) {
                    return <MathInline key={mi} formula={mp.slice(1, -1)} />
                  }
                  return <span key={mi}>{mp}</span>
                })}
              </strong>
            )
          }
          return (
            <strong
              key={index}
              className="font-semibold"
              style={{ color: CLAUDE_TEXT_COLOR }}
            >
              {inner}
            </strong>
          )
        }
        // Check for inline math $...$
        const mathParts = part.split(/(\$[^$]+\$)/g)
        if (mathParts.length > 1) {
          return (
            <span key={index}>
              {mathParts.map((mp, mi) => {
                if (mp.startsWith("$") && mp.endsWith("$")) {
                  return <MathInline key={mi} formula={mp.slice(1, -1)} />
                }
                return <span key={mi}>{mp}</span>
              })}
            </span>
          )
        }
        return <span key={index}>{part}</span>
      })}
    </>
  )
})

// ============================================
// Table Renderer - Clean style
// ============================================

const TableBlock = memo(function TableBlock({ lines }: { lines: string[] }) {
  if (lines.length < 2) return null

  try {
    const headerLine = lines.find(l => l.includes("|") && !l.includes("---"))
    const bodyLines = lines.filter(l => l.includes("|") && !l.includes("---") && l !== headerLine)

    if (!headerLine) return null

    const headers = headerLine.split("|").filter(c => c.trim()).map(c => c.trim())

    return (
      <div className="my-4 overflow-hidden rounded-lg border" style={{ borderColor: slateColors[200] }}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y" style={{ borderColor: slateColors[200] }}>
            <thead style={{ backgroundColor: slateColors[50] }}>
              <tr>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: CLAUDE_SECONDARY_COLOR }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: slateColors[100] }}>
              {bodyLines.map((line, i) => {
                const cells = line.split("|").filter(c => c.trim()).map(c => c.trim())
                return (
                  <tr
                    key={i}
                    className="transition-colors hover:bg-slate-50/50"
                  >
                    {cells.map((cell, j) => (
                      <td
                        key={j}
                        className="px-4 py-3 text-sm"
                        style={{ color: CLAUDE_TEXT_COLOR }}
                      >
                        <InlineText text={cell} />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  } catch (e) {
    return null
  }
})

// ============================================
// Streaming Cursor
// ============================================

function StreamingCursor() {
  return (
    <span
      className="inline-block animate-pulse ml-0.5"
      style={{
        width: 2,
        height: "1em",
        backgroundColor: CLAUDE_ACCENT_COLOR,
        verticalAlign: "text-bottom"
      }}
    >
      ▌
    </span>
  )
}

// ============================================
// Main Renderer
// ============================================

const UltimateRenderer = memo(function UltimateRenderer({
  content,
  className
}: UltimateRendererProps) {
  const elements = useMemo(() => {
    if (!content) {
      return <StreamingCursor />
    }

    const lines = content.split("\n")
    const renderedElements: React.ReactElement[] = []
    let tableBuffer: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const isTableLine = line.trim().startsWith("|") && line.includes("|")
      const isLastLine = i === lines.length - 1

      // Handle tables
      if (isTableLine) {
        tableBuffer.push(line)
        if (i === lines.length - 1 || !lines[i + 1].trim().startsWith("|")) {
          renderedElements.push(<TableBlock key={`tbl-${i}`} lines={tableBuffer} />)
          tableBuffer = []
        }
        continue
      }

      // H1 - 带绿色装饰条
      if (line.trim().startsWith("# ")) {
        renderedElements.push(
          <h1
            key={i}
            className="text-xl font-semibold mt-5 mb-3 pl-3 border-l-4"
            style={{
              color: "#111827",
              borderColor: CLAUDE_ACCENT_COLOR,
              lineHeight: 1.4,
            }}
          >
            {line.replace(/^#\s+/, "")}
            {isLastLine && <StreamingCursor />}
          </h1>
        )
      }
      // H2 - 带绿色装饰条
      else if (line.trim().startsWith("## ")) {
        renderedElements.push(
          <h2
            key={i}
            className="text-lg font-semibold mt-5 mb-3 pl-3 border-l-4"
            style={{
              color: "#111827",
              borderColor: CLAUDE_ACCENT_COLOR,
              lineHeight: 1.4,
            }}
          >
            {line.replace(/^##\s+/, "")}
            {isLastLine && <StreamingCursor />}
          </h2>
        )
      }
      // H3 - 带绿色装饰条
      else if (line.trim().startsWith("### ")) {
        renderedElements.push(
          <h3
            key={i}
            className="text-base font-semibold mt-5 mb-3 pl-3 border-l-4"
            style={{
              color: "#111827",
              borderColor: CLAUDE_ACCENT_COLOR,
              lineHeight: 1.4,
            }}
          >
            {line.replace(/^###\s+/, "")}
            {isLastLine && <StreamingCursor />}
          </h3>
        )
      }
      // H4 - 带绿色装饰条
      else if (line.trim().startsWith("#### ")) {
        renderedElements.push(
          <h4
            key={i}
            className="text-sm font-semibold mt-4 mb-2 pl-3 border-l-4"
            style={{
              color: "#111827",
              borderColor: CLAUDE_ACCENT_COLOR,
              lineHeight: 1.4,
            }}
          >
            {line.replace(/^####\s+/, "")}
            {isLastLine && <StreamingCursor />}
          </h4>
        )
      }
      // Unordered list - 绿色小圆点，紧凑间距
      else if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
        const listContent = line.trim().replace(/^[-*]\s+/, "")
        renderedElements.push(
          <div
            key={i}
            className="flex gap-2 my-1 text-sm"
            style={{ lineHeight: 1.5, color: CLAUDE_TEXT_COLOR }}
          >
            <span
              className="mt-[5px] w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: CLAUDE_ACCENT_COLOR }}
            />
            <span>
              <InlineText text={listContent} />
              {isLastLine && <StreamingCursor />}
            </span>
          </div>
        )
      }
      // Ordered list - 绿色加粗数字，紧凑间距
      else if (/^\d+\.\s/.test(line.trim())) {
        const match = line.trim().match(/^(\d+)\.\s(.*)/)
        if (match) {
          renderedElements.push(
            <div
              key={i}
              className="flex gap-2 my-1 text-sm"
              style={{ lineHeight: 1.5, color: CLAUDE_TEXT_COLOR }}
            >
              <span
                className="font-bold shrink-0 w-5 text-center text-xs"
                style={{ color: CLAUDE_ACCENT_COLOR }}
              >
                {match[1]}.
              </span>
              <span>
                <InlineText text={match[2]} />
                {isLastLine && <StreamingCursor />}
              </span>
            </div>
          )
        }
      }
      // Blockquote - 绿色左边框
      else if (line.trim().startsWith("> ")) {
        renderedElements.push(
          <blockquote
            key={i}
            className="my-3 px-4 py-3 border-l-4 rounded-r"
            style={{
              borderColor: CLAUDE_ACCENT_COLOR,
              lineHeight: 1.5,
              color: CLAUDE_SECONDARY_COLOR,
              backgroundColor: slateColors[50],
            }}
          >
            <div className="text-sm">
              <InlineText text={line.replace(/^> /, "")} />
              {isLastLine && <StreamingCursor />}
            </div>
          </blockquote>
        )
      }
      // Divider
      else if (line.trim() === "---") {
        renderedElements.push(
          <div key={i} className="py-4">
            <div
              className="h-px"
              style={{
                background: `linear-gradient(to right, transparent, ${slateColors[200]}, transparent)`
              }}
            />
          </div>
        )
      }
      // Empty line
      else if (line.trim() === "") {
        renderedElements.push(<div key={i} className="h-2" />)
      }
      // Skip code block markers
      else if (line.trim().startsWith("```")) {
        continue
      }
      // Block-level LaTeX formula $$...$$
      else if (line.trim().startsWith("$$") && line.trim().endsWith("$$")) {
        const formula = line.trim().slice(2, -2).trim()
        if (formula) {
          renderedElements.push(
            <div key={i} className="my-4 flex justify-center">
              <MathBlock formula={formula} />
            </div>
          )
        }
        continue
      }
      // Regular paragraph - 行高1.5，紧凑间距
      else {
        renderedElements.push(
          <p
            key={i}
            className="text-sm my-1.5"
            style={{ lineHeight: 1.5, color: CLAUDE_TEXT_COLOR, marginBottom: '0.75rem' }}
          >
            <InlineText text={line} />
            {isLastLine && <StreamingCursor />}
          </p>
        )
      }
    }

    return renderedElements
  }, [content])

  return (
    <div className={cn("w-full", className)}>
      {elements}
    </div>
  )
})

export { UltimateRenderer, InlineText, TableBlock }
export default UltimateRenderer
