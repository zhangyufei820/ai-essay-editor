import katex from "katex"

import { LATEX_MACROS } from "@/lib/latex-constants"
import { cleanLLMText } from "@/lib/text-sanitizer"
import { splitThinkingContent } from "@/lib/think-content"

function stripThinking(raw: string) {
  const parsed = splitThinkingContent(raw)
  return parsed.answer || (parsed.hasThinking ? "" : raw)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function renderMath(markdown: string) {
  const mathBlocks: string[] = []
  const inlineMath: string[] = []

  const withBlocks = markdown.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    const html = katex.renderToString(math.trim(), {
      displayMode: true,
      throwOnError: false,
      trust: false,
      strict: "ignore",
      macros: LATEX_MACROS,
    })
    const token = `@@MATH_BLOCK_${mathBlocks.length}@@`
    mathBlocks.push(html)
    return token
  })

  const withInline = withBlocks.replace(/\$([^$\n]+?)\$/g, (_, math) => {
    const html = katex.renderToString(math.trim(), {
      displayMode: false,
      throwOnError: false,
      trust: false,
      strict: "ignore",
      macros: LATEX_MACROS,
    })
    const token = `@@MATH_INLINE_${inlineMath.length}@@`
    inlineMath.push(html)
    return token
  })

  return { markdown: withInline, mathBlocks, inlineMath }
}

function restoreMath(html: string, mathBlocks: string[], inlineMath: string[]) {
  let restored = html
  mathBlocks.forEach((math, index) => {
    restored = restored.replaceAll(`@@MATH_BLOCK_${index}@@`, math)
  })
  inlineMath.forEach((math, index) => {
    restored = restored.replaceAll(`@@MATH_INLINE_${index}@@`, math)
  })
  return restored
}

function convertInlineMarkdown(text: string) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
}

function parseTableRow(line: string) {
  const trimmed = line.trim()
  if (!trimmed.includes("|")) return null

  let cells = trimmed.split("|")
  if (cells[0]?.trim() === "") cells = cells.slice(1)
  if (cells[cells.length - 1]?.trim() === "") cells = cells.slice(0, -1)

  const normalized = cells.map((cell) => cell.trim())
  return normalized.length >= 2 ? normalized : null
}

function isTableSeparatorRow(line: string) {
  const cells = parseTableRow(line)
  if (!cells) return false

  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")))
}

function renderTableBlock(rows: string[][]) {
  const [header, ...body] = rows
  const columnCount = Math.max(header.length, ...body.map((row) => row.length))
  const normalizeRow = (row: string[]) => Array.from({ length: columnCount }, (_, index) => row[index] ?? "")

  const headerHtml = normalizeRow(header)
    .map((cell) => `<th>${convertInlineMarkdown(cell)}</th>`)
    .join("")
  const bodyHtml = body
    .map((row) => `<tr>${normalizeRow(row).map((cell) => `<td>${convertInlineMarkdown(cell)}</td>`).join("")}</tr>`)
    .join("")

  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`
}

export function prepareChatMarkdown(raw: string) {
  return cleanLLMText(stripThinking(raw)).trim()
}

export function markdownToSafeHtml(raw: string) {
  const prepared = prepareChatMarkdown(raw)
  const { markdown, mathBlocks, inlineMath } = renderMath(prepared)
  const lines = markdown.split(/\r?\n/)
  const html: string[] = []
  let listType: "ul" | "ol" | null = null
  let inCode = false
  let codeLines: string[] = []

  const closeList = () => {
    if (!listType) return
    html.push(`</${listType}>`)
    listType = null
  }

  const closeCode = () => {
    if (!inCode) return
    html.push(`<pre><code>${codeLines.join("\n")}</code></pre>`)
    codeLines = []
    inCode = false
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (trimmed.startsWith("```")) {
      closeList()
      if (inCode) closeCode()
      else inCode = true
      continue
    }

    if (inCode) {
      codeLines.push(line)
      continue
    }

    if (!trimmed) {
      closeList()
      continue
    }

    if (/^---+$/.test(trimmed)) {
      closeList()
      html.push("<hr>")
      continue
    }

    const tableHeader = parseTableRow(trimmed)
    const nextLine = lines[index + 1]?.trim() ?? ""
    if (tableHeader && isTableSeparatorRow(nextLine)) {
      closeList()
      const tableRows: string[][] = [tableHeader]
      index += 2

      while (index < lines.length) {
        const row = parseTableRow(lines[index])
        if (!row) {
          index -= 1
          break
        }

        tableRows.push(row)
        index += 1
      }

      html.push(renderTableBlock(tableRows))
      continue
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      closeList()
      const level = heading[1].length
      html.push(`<h${level}>${convertInlineMarkdown(heading[2])}</h${level}>`)
      continue
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/)
    if (unordered) {
      if (listType !== "ul") {
        closeList()
        html.push("<ul>")
        listType = "ul"
      }
      html.push(`<li>${convertInlineMarkdown(unordered[1])}</li>`)
      continue
    }

    const ordered = trimmed.match(/^(?:\d+[.)、]|[一二三四五六七八九十]+[、.)])\s+(.+)$/)
    if (ordered) {
      if (listType !== "ol") {
        closeList()
        html.push("<ol>")
        listType = "ol"
      }
      html.push(`<li>${convertInlineMarkdown(ordered[1])}</li>`)
      continue
    }

    if (trimmed.startsWith(">")) {
      closeList()
      html.push(`<blockquote>${convertInlineMarkdown(trimmed.replace(/^>\s*/, ""))}</blockquote>`)
      continue
    }

    closeList()
    html.push(`<p>${convertInlineMarkdown(trimmed)}</p>`)
  }

  closeCode()
  closeList()

  return restoreMath(html.join("\n"), mathBlocks, inlineMath)
}

export function buildChatPdfDocumentHtml(raw: string, options?: { title?: string }) {
  const title = options?.title ?? "沈翔智学 - AI 分析报告"
  const safeHtmlContent = markdownToSafeHtml(raw)

  return `
    <div class="pdf-report">
      <div class="header">
        <h1>${escapeHtml(title)}</h1>
        <p>${new Date().toLocaleString("zh-CN")}</p>
      </div>
      <div class="content">${safeHtmlContent}</div>
      <div class="footer">由沈翔智学 AI 生成 · www.shenxiang.school</div>
    </div>
  `
}

export const chatPdfStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  .pdf-report {
    width: 794px;
    background: #fff;
    color: #1f2f24;
    font-family: 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', sans-serif;
    line-height: 1.85;
    padding: 42px;
  }
  .header {
    text-align: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #14532d;
  }
  .header h1 { color: #14532d; font-size: 24px; margin-bottom: 8px; }
  .header p { color: #66766a; font-size: 12px; }
  .content { font-size: 14px; }
  .content h1 { font-size: 22px; color: #14532d; margin: 24px 0 12px; }
  .content h2 { font-size: 18px; color: #14532d; margin: 20px 0 10px; border-left: 3px solid #14532d; padding-left: 10px; }
  .content h3 { font-size: 16px; color: #14532d; margin: 16px 0 8px; }
  .content h4 { font-size: 14px; color: #526259; margin: 12px 0 6px; }
  .content p { margin: 8px 0; }
  .content strong { color: #14532d; font-weight: 700; }
  .content ul, .content ol { margin: 12px 0; padding-left: 24px; }
  .content li { margin: 6px 0; }
  .content blockquote {
    margin: 12px 0;
    padding: 12px 16px;
    background: #f6f4ec;
    border-left: 3px solid #14532d;
    color: #3f4d44;
  }
  .content code {
    border-radius: 4px;
    background: #f1efe7;
    padding: 1px 4px;
    color: #14532d;
    font-family: 'SFMono-Regular', Consolas, monospace;
  }
  .content pre {
    margin: 14px 0;
    padding: 12px;
    white-space: pre-wrap;
    border-radius: 8px;
    background: #17251b;
    color: #f8faf8;
  }
  .content hr { margin: 20px 0; border: none; border-top: 1px solid #e7e0d3; }
  .content table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 13px;
    table-layout: fixed;
  }
  .content th, .content td {
    border: 1px solid #ddd5c7;
    padding: 8px 12px;
    text-align: left;
    vertical-align: top;
    word-break: break-word;
  }
  .content th {
    background: #f6f4ec;
    font-weight: 700;
    color: #14532d;
  }
  .footer {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid #e7e0d3;
    text-align: center;
    color: #889489;
    font-size: 11px;
  }
  .katex-error { color: #B71C1C; font-size: 0.9em; }
`

export async function exportChatContentToPDF(raw: string, options?: { title?: string; filenamePrefix?: string }) {
  let reportRoot: HTMLDivElement | null = null
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ])

  try {
    reportRoot = document.createElement("div")
    reportRoot.innerHTML = `<style>${chatPdfStyles}</style>${buildChatPdfDocumentHtml(raw, { title: options?.title })}`
    Object.assign(reportRoot.style, {
      position: "fixed",
      left: "0",
      top: "0",
      width: "794px",
      background: "#fff",
      pointerEvents: "none",
      transform: "translateX(-10000px)",
      zIndex: "-1",
    })
    document.body.appendChild(reportRoot)

    if ("fonts" in document) {
      await document.fonts.ready
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const canvas = await html2canvas(reportRoot, {
      backgroundColor: "#ffffff",
      logging: false,
      scale: Math.min(2, window.devicePixelRatio || 1.5),
      useCORS: true,
      windowWidth: reportRoot.scrollWidth,
      windowHeight: reportRoot.scrollHeight,
    })

    const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4", compress: true })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 24
    const outputWidth = pageWidth - margin * 2
    const outputHeight = pageHeight - margin * 2
    const pageHeightPx = Math.floor((outputHeight / outputWidth) * canvas.width)
    const pageCanvas = document.createElement("canvas")
    const pageContext = pageCanvas.getContext("2d")
    if (!pageContext) throw new Error("无法创建 PDF 分页画布")

    pageCanvas.width = canvas.width
    let sourceY = 0
    let pageIndex = 0
    while (sourceY < canvas.height) {
      const sliceHeightPx = Math.min(pageHeightPx, canvas.height - sourceY)
      pageCanvas.height = sliceHeightPx
      pageContext.clearRect(0, 0, pageCanvas.width, pageCanvas.height)
      pageContext.drawImage(canvas, 0, sourceY, canvas.width, sliceHeightPx, 0, 0, pageCanvas.width, sliceHeightPx)
      if (pageIndex > 0) pdf.addPage()
      const renderedHeight = (sliceHeightPx / canvas.width) * outputWidth
      pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", margin, margin, outputWidth, renderedHeight)
      sourceY += sliceHeightPx
      pageIndex += 1
    }

    const filenameDate = new Date().toISOString().slice(0, 10)
    pdf.save(`${options?.filenamePrefix ?? "沈翔智学-AI分析报告"}-${filenameDate}.pdf`)
  } finally {
    reportRoot?.remove()
  }
}
