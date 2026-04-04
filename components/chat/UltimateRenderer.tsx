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

// Claude style colors
const CLAUDE_TEXT_COLOR = "#374151"
const CLAUDE_SECONDARY_COLOR = "#6B7280"
const CLAUDE_ACCENT_COLOR = "#10B981"

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

const InlineText = memo(function InlineText({ text }: { text: string }) {
  if (!text) return null

  const parts = text.split(/(\*\*.*?\*\*)/g)

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong
              key={index}
              className="font-semibold"
              style={{ color: CLAUDE_TEXT_COLOR }}
            >
              {part.slice(2, -2)}
            </strong>
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

      // H1 - Clean, no decorations
      if (line.trim().startsWith("# ")) {
        renderedElements.push(
          <h1
            key={i}
            className="text-xl font-bold mt-6 mb-3"
            style={{ color: CLAUDE_TEXT_COLOR }}
          >
            {line.replace(/^#\s+/, "")}
            {isLastLine && <StreamingCursor />}
          </h1>
        )
      }
      // H2 - Clean, no left border
      else if (line.trim().startsWith("## ")) {
        renderedElements.push(
          <h2
            key={i}
            className="text-lg font-semibold mt-5 mb-2"
            style={{ color: CLAUDE_TEXT_COLOR }}
          >
            {line.replace(/^##\s+/, "")}
            {isLastLine && <StreamingCursor />}
          </h2>
        )
      }
      // H3
      else if (line.trim().startsWith("### ")) {
        renderedElements.push(
          <h3
            key={i}
            className="text-base font-semibold mt-4 mb-2"
            style={{ color: CLAUDE_TEXT_COLOR }}
          >
            {line.replace(/^###\s+/, "")}
            {isLastLine && <StreamingCursor />}
          </h3>
        )
      }
      // H4
      else if (line.trim().startsWith("#### ")) {
        renderedElements.push(
          <h4
            key={i}
            className="text-sm font-semibold mt-3 mb-2"
            style={{ color: CLAUDE_TEXT_COLOR }}
          >
            {line.replace(/^####\s+/, "")}
            {isLastLine && <StreamingCursor />}
          </h4>
        )
      }
      // Unordered list - Minimal bullet
      else if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
        const listContent = line.trim().replace(/^[-*]\s+/, "")
        renderedElements.push(
          <div
            key={i}
            className="flex gap-2 my-2 text-sm"
            style={{ lineHeight: 1.6, color: CLAUDE_TEXT_COLOR }}
          >
            <span
              className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: CLAUDE_SECONDARY_COLOR }}
            />
            <span>
              <InlineText text={listContent} />
              {isLastLine && <StreamingCursor />}
            </span>
          </div>
        )
      }
      // Ordered list
      else if (/^\d+\.\s/.test(line.trim())) {
        const match = line.trim().match(/^(\d+)\.\s(.*)/)
        if (match) {
          renderedElements.push(
            <div
              key={i}
              className="flex gap-2 my-2 text-sm"
              style={{ lineHeight: 1.6, color: CLAUDE_TEXT_COLOR }}
            >
              <span
                className="font-medium shrink-0 w-5 text-center"
                style={{ color: CLAUDE_SECONDARY_COLOR }}
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
      // Blockquote - Minimal left border, no background
      else if (line.trim().startsWith("> ")) {
        renderedElements.push(
          <blockquote
            key={i}
            className="my-3 px-3 py-2 border-l-2 rounded-r"
            style={{
              borderColor: slateColors[300],
              backgroundColor: slateColors[50]
            }}
          >
            <div
              className="text-sm"
              style={{ lineHeight: 1.6, color: CLAUDE_SECONDARY_COLOR }}
            >
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
      // Regular paragraph
      else {
        renderedElements.push(
          <p
            key={i}
            className="text-sm my-2"
            style={{ lineHeight: 1.6, color: CLAUDE_TEXT_COLOR }}
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
