/**
 * 📝 沈翔学校 - 终极渲染器 (Ultimate Renderer)
 * 
 * 用于渲染 AI 回复内容的 Markdown 解析器，支持丰富的格式。
 */

"use client"

import React, { useMemo, memo, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { brandColors, slateColors } from "@/lib/design-tokens"

// ============================================
// 类型定义
// ============================================

interface UltimateRendererProps {
  /** Markdown 内容 */
  content: string
  /** 自定义类名 */
  className?: string
}

// ============================================
// 内联文本渲染器（处理加粗）
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
              style={{ color: brandColors[900] }}
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
// 表格渲染器
// ============================================

const TableBlock = memo(function TableBlock({ lines }: { lines: string[] }) {
  if (lines.length < 2) return null
  
  try {
    const headerLine = lines.find(l => l.includes("|") && !l.includes("---"))
    const bodyLines = lines.filter(l => l.includes("|") && !l.includes("---") && l !== headerLine)
    
    if (!headerLine) return null
    
    const headers = headerLine.split("|").filter(c => c.trim()).map(c => c.trim())
    
    return (
      <div className="my-5 overflow-hidden rounded-xl border" style={{ borderColor: slateColors[100] }}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y" style={{ borderColor: slateColors[100] }}>
            <thead style={{ backgroundColor: slateColors[50] }}>
              <tr>
                {headers.map((h, i) => (
                  <th 
                    key={i} 
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: slateColors[600] }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: slateColors[50] }}>
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
                        style={{ color: slateColors[600] }}
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
// 流式光标
// ============================================

function StreamingCursor() {
  return (
    <span 
      className="inline-block animate-pulse ml-0.5"
      style={{ 
        width: 2, 
        height: "1em", 
        backgroundColor: brandColors[600],
        verticalAlign: "text-bottom"
      }}
    >
      ▌
    </span>
  )
}

// ============================================
// 终极渲染器主组件
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
      
      // 处理表格
      if (isTableLine) {
        tableBuffer.push(line)
        if (i === lines.length - 1 || !lines[i + 1].trim().startsWith("|")) {
          renderedElements.push(<TableBlock key={`tbl-${i}`} lines={tableBuffer} />)
          tableBuffer = []
        }
        continue
      }
      
      // H1 标题 - 带左侧品牌色竖线
      if (line.trim().startsWith("# ")) {
        renderedElements.push(
          <h1 
            key={i} 
            className="mt-8 mb-4 text-2xl font-bold flex items-center gap-3"
            style={{ color: slateColors[800] }}
          >
            <span 
              className="w-1 h-7 rounded-full shrink-0"
              style={{ backgroundColor: brandColors[900] }}
            />
            {line.replace(/^#\s+/, "")}
          </h1>
        )
      }
      // H2 标题 - 带左侧品牌色圆点
      else if (line.trim().startsWith("## ")) {
        renderedElements.push(
          <h2 
            key={i} 
            className="mt-6 mb-3 text-xl font-semibold flex items-center gap-2"
            style={{ color: slateColors[700] }}
          >
            <span 
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: brandColors[700] }}
            />
            {line.replace(/^##\s+/, "")}
          </h2>
        )
      }
      // H3 标题
      else if (line.trim().startsWith("### ")) {
        renderedElements.push(
          <h3 
            key={i} 
            className="mt-5 mb-2 text-lg font-semibold"
            style={{ color: brandColors[900] }}
          >
            {line.replace(/^###\s+/, "")}
          </h3>
        )
      }
      // 无序列表
      else if (line.trim().startsWith("- ")) {
        renderedElements.push(
          <div 
            key={i} 
            className="flex gap-3 ml-1 my-2 text-[15px] leading-[1.8]"
            style={{ color: slateColors[600] }}
          >
            <div 
              className="mt-[10px] w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: `${brandColors[600]}99` }}
            />
            <span>
              <InlineText text={line.replace(/^- /, "")} />
            </span>
          </div>
        )
      }
      // 有序列表（数字开头）
      else if (/^\d+\.\s/.test(line.trim())) {
        const match = line.trim().match(/^(\d+)\.\s(.*)/)
        if (match) {
          renderedElements.push(
            <div 
              key={i} 
              className="flex gap-3 ml-1 my-2 text-[15px] leading-[1.8]"
              style={{ color: slateColors[600] }}
            >
              <span 
                className="font-semibold shrink-0 w-5 text-center"
                style={{ color: brandColors[700] }}
              >
                {match[1]}.
              </span>
              <span>
                <InlineText text={match[2]} />
              </span>
            </div>
          )
        }
      }
      // 引用块
      else if (line.trim().startsWith("> ")) {
        renderedElements.push(
          <blockquote 
            key={i} 
            className="my-4 px-4 py-3 rounded-r-xl border-l-[3px]"
            style={{ 
              borderColor: brandColors[600],
              backgroundColor: brandColors[50]
            }}
          >
            <div 
              className="text-[15px] leading-[1.8]"
              style={{ color: slateColors[600] }}
            >
              <InlineText text={line.replace(/^> /, "")} />
            </div>
          </blockquote>
        )
      }
      // 分隔线
      else if (line.trim() === "---") {
        renderedElements.push(
          <div key={i} className="py-6">
            <div 
              className="h-px"
              style={{ 
                background: `linear-gradient(to right, transparent, ${slateColors[200]}, transparent)` 
              }}
            />
          </div>
        )
      }
      // 空行
      else if (line.trim() === "") {
        renderedElements.push(<div key={i} className="h-3" />)
      }
      // 代码块开始
      else if (line.trim().startsWith("```")) {
        // 简单处理：跳过代码块标记
        continue
      }
      // 普通段落
      else {
        renderedElements.push(
          <p 
            key={i} 
            className="text-[15px] leading-[1.8] my-3"
            style={{ color: slateColors[600] }}
          >
            <InlineText text={line} />
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
