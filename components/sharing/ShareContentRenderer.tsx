"use client"

import Image from "next/image"
import type { ReactNode } from "react"
import { BookOpenCheck, FileText, ImageIcon, MessageSquareText, Presentation, Sparkles, Trophy, Video } from "lucide-react"

type ShareContentData = Record<string, unknown>

type Share = {
  content_type: string
  title: string
  content_data: ShareContentData
  thumbnail_url?: string | null
  preview_text?: string | null
  subject_label?: string | null
}

type UploadedImage = {
  name: string
  url: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function readFirstText(data: ShareContentData, keys: string[]) {
  for (const key of keys) {
    const value = asText(data[key])
    if (value) return value
  }
  return ""
}

function imageUrlFromUnknown(value: unknown) {
  if (typeof value === "string") return value.trim()
  if (!isRecord(value)) return ""
  return readFirstText(value, ["url", "modelUrl", "model_url", "gatewayUrl", "gateway_url", "data", "src"])
}

function isImageLike(value: unknown) {
  if (!isRecord(value)) return false
  const type = asText(value.type).toLowerCase()
  const url = imageUrlFromUnknown(value).toLowerCase()
  return type.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(url)
}

function getUploadedImages(data: ShareContentData) {
  const sources = [data.user_uploaded_images, data.uploaded_images, data.images, data.files]
  const images: UploadedImage[] = []
  for (const source of sources) {
    if (!Array.isArray(source)) continue
    for (const item of source) {
      const url = imageUrlFromUnknown(item)
      if (!url) continue
      if (typeof item === "string" || isImageLike(item)) {
        images.push({
          name: isRecord(item) ? asText(item.name) || "用户上传图片" : "用户上传图片",
          url,
        })
      }
    }
  }
  return images
}

function getMainImageUrl(share: Share) {
  if (share.thumbnail_url) return share.thumbnail_url
  return readFirstText(share.content_data, [
    "main_image_url",
    "mainImageUrl",
    "image_url",
    "imageUrl",
    "result_image_url",
    "resultImageUrl",
    "original_image_url",
    "originalImageUrl",
  ]) || getUploadedImages(share.content_data)[0]?.url || ""
}

function stripThinking(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
}

function extractOriginalText(text: string) {
  const match = text.match(/(?:完整文字信息|提取的完整文字信息|识别文本)[：:]\s*([\s\S]*?)(?:<think>|#{1,4}\s|$)/)
  return match?.[1]?.trim() || ""
}

function getAssistantResult(data: ShareContentData) {
  const explicit = readFirstText(data, ["ai_result", "revised_text", "revisedText", "final_text", "finalText", "result", "answer", "content"])
  if (explicit) return stripThinking(explicit)

  const messages = Array.isArray(data.messages) ? data.messages : []
  const assistantMessages = messages
    .filter(isRecord)
    .filter((message) => asText(message.role) === "assistant")
  const lastAssistant = assistantMessages.at(-1)
  return stripThinking(asText(lastAssistant?.content))
}

function getOriginalText(data: ShareContentData, aiResult: string) {
  return readFirstText(data, ["original_text", "originalText", "source_text", "sourceText", "ocr_text", "ocrText"]) || extractOriginalText(aiResult)
}

function cleanDisplayResult(text: string) {
  return stripThinking(text)
    .replace(/^正在取图片信息[\s\S]*?(?=#{1,4}\s)/, "")
    .replace(/^以下为.*?完整文字信息[：:][\s\S]*?(?=#{1,4}\s)/, "")
    .trim()
}

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={index} className="font-semibold text-[var(--ink-900)]">{part.slice(2, -2)}</strong>
        }
        return <span key={index}>{part.replace(/`([^`]+)`/g, "$1")}</span>
      })}
    </>
  )
}

function renderTable(lines: string[], key: string) {
  const rows = lines
    .filter((line) => !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line))
    .map((line) => line.split("|").map((cell) => cell.trim()).filter(Boolean))
    .filter((row) => row.length > 0)
  if (!rows.length) return null
  const [head, ...body] = rows
  return (
    <div key={key} className="my-5 overflow-hidden rounded-[var(--radius-sharp)] border border-[var(--ink-100)] bg-[var(--paper-50)] shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--ink-100)] text-sm">
          <thead className="bg-[var(--ink-50)]">
            <tr>{head.map((cell, index) => <th key={index} className="px-4 py-3 text-left font-semibold text-[var(--ink-900)]"><InlineText text={cell} /></th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {body.map((row, rowIndex) => (
              <tr key={rowIndex} className="align-top">
                {row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-3 leading-6 text-[var(--ink-700)]"><InlineText text={cell} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function renderFormattedContent(text: string) {
  const lines = cleanDisplayResult(text).split("\n")
  const nodes: ReactNode[] = []
  let tableLines: string[] = []
  let listItems: string[] = []

  const flushList = () => {
    if (!listItems.length) return
    const items = listItems
    listItems = []
    nodes.push(
      <ul key={`list-${nodes.length}`} className="my-4 space-y-2 rounded-[var(--radius-sharp)] bg-[var(--paper-50)] px-5 py-4 text-sm leading-7 text-[var(--ink-700)]">
        {items.map((item, index) => (
          <li key={index} className="flex gap-3">
            <span className="mt-3 size-1.5 shrink-0 rounded-full bg-[var(--ink-600)]" />
            <span><InlineText text={item} /></span>
          </li>
        ))}
      </ul>,
    )
  }

  const flushTable = () => {
    if (!tableLines.length) return
    flushList()
    const rendered = renderTable(tableLines, `table-${nodes.length}`)
    tableLines = []
    if (rendered) nodes.push(rendered)
  }

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim()
    const isTableLine = line.startsWith("|") && line.includes("|")
    if (isTableLine) {
      tableLines.push(line)
      return
    }
    flushTable()

    if (!line) {
      flushList()
      return
    }
    if (/^---+$/.test(line)) {
      flushList()
      nodes.push(<hr key={`hr-${index}`} className="my-6 border-[var(--ink-100)]" />)
      return
    }
    if (line.startsWith("### ")) {
      flushList()
      nodes.push(<h2 key={index} className="mt-7 border-l-4 border-[var(--ink-600)] pl-3 text-xl font-semibold text-[var(--ink-900)]"><InlineText text={line.replace(/^###\s+/, "")} /></h2>)
      return
    }
    if (line.startsWith("#### ")) {
      flushList()
      nodes.push(<h3 key={index} className="mt-5 text-base font-semibold text-[var(--ink-900)]"><InlineText text={line.replace(/^####\s+/, "")} /></h3>)
      return
    }
    if (line.startsWith("## ")) {
      flushList()
      nodes.push(<h2 key={index} className="mt-7 border-l-4 border-[var(--ink-600)] pl-3 text-xl font-semibold text-[var(--ink-900)]"><InlineText text={line.replace(/^##\s+/, "")} /></h2>)
      return
    }
    if (line.startsWith("# ")) {
      flushList()
      nodes.push(<h2 key={index} className="mt-7 text-2xl font-bold text-[var(--ink-900)]"><InlineText text={line.replace(/^#\s+/, "")} /></h2>)
      return
    }
    const listMatch = line.match(/^[-*]\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/)
    if (listMatch) {
      listItems.push(listMatch[1])
      return
    }
    flushList()
    nodes.push(<p key={index} className="my-3 text-base leading-8 text-[var(--ink-700)]"><InlineText text={line} /></p>)
  })

  flushTable()
  flushList()
  return nodes.length ? nodes : <p className="text-base leading-8 text-[var(--ink-700)]">暂无可展示内容。</p>
}

function TextBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-5">
      <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--ink-900)]">
        <FileText className="size-4 text-[var(--ink-700)]" />
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function HtmlCover({ share }: { share: Share }) {
  return (
    <div className="flex aspect-[16/10] min-h-[260px] flex-col justify-between rounded-[var(--radius-sharp)] border border-[var(--ink-100)] bg-[linear-gradient(135deg,#f7faf7_0%,#ecfdf5_55%,#fff7ed_100%)] p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-[var(--paper-50)] px-3 py-1 text-sm font-medium text-[var(--ink-700)] shadow-sm">{share.subject_label || "AI 学习作品"}</span>
        <Sparkles className="size-6 text-[var(--ink-700)]" />
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--ink-800)]">沈翔智学 · 作品分享</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-bold leading-tight text-[var(--ink-900)]">{share.title}</h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--ink-600)]">{share.preview_text || "查看用户上传内容与 AI 修改后的完整排版。"}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <span className="h-2 rounded-full bg-[var(--ink-300)]" />
        <span className="h-2 rounded-full bg-amber-200" />
        <span className="h-2 rounded-full bg-[var(--paper-200)]" />
      </div>
    </div>
  )
}

function MainVisual({ share }: { share: Share }) {
  const imageUrl = getMainImageUrl(share)
  if (!imageUrl) return <HtmlCover share={share} />
  return (
    <div className="overflow-hidden rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)]">
      <div className="relative aspect-[16/10]">
        <Image src={imageUrl} alt={`${share.title} 主图`} fill className="object-contain" unoptimized />
      </div>
    </div>
  )
}

function UploadedImageGallery({ images }: { images: UploadedImage[] }) {
  if (images.length <= 1) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {images.slice(1, 5).map((image) => (
        <div key={image.url} className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)]">
          <Image src={image.url} alt={image.name} fill className="object-contain" unoptimized />
        </div>
      ))}
    </div>
  )
}

function FlashcardPreview({ cards = [] }: { cards?: Array<{ question?: string; answer?: string; difficulty?: number }> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.slice(0, 6).map((card, index) => (
        <div key={index} className="rounded-[var(--radius-sharp)] border border-[var(--ink-100)] bg-[var(--ink-50)]/60 p-4">
          <p className="text-xs font-medium text-[var(--ink-700)]">Q{index + 1}</p>
          <p className="mt-2 font-medium text-[var(--ink-900)]">{card.question || "闪卡问题"}</p>
          <p className="mt-3 text-sm text-[var(--ink-600)]">{card.answer || "闪卡答案"}</p>
        </div>
      ))}
    </div>
  )
}

function WorkArticle({ share }: { share: Share }) {
  const data = share.content_data || {}
  const aiResult = getAssistantResult(data)
  const originalText = getOriginalText(data, aiResult)
  const uploadedImages = getUploadedImages(data)

  return (
    <div className="space-y-5">
      <MainVisual share={share} />
      <UploadedImageGallery images={uploadedImages} />
      {originalText ? (
        <TextBlock title="用户上传内容识别">
          <div className="max-h-[360px] overflow-auto rounded-[var(--radius-sharp)] bg-[var(--paper-50)] p-4 text-sm leading-7 text-[var(--ink-700)] whitespace-pre-wrap">
            {originalText}
          </div>
        </TextBlock>
      ) : null}
      <TextBlock title={share.content_type === "essay_review" ? "AI 修改与点评完整内容" : "AI 生成的完整作品内容"}>
        <article className="max-w-none">{renderFormattedContent(aiResult || share.preview_text || "")}</article>
      </TextBlock>
    </div>
  )
}

export function ShareContentRenderer({ share }: { share: Share }) {
  const data = share.content_data || {}

  if (share.content_type === "image") {
    const imageUrl = getMainImageUrl(share)
    return (
      <div className="space-y-4">
        {imageUrl ? (
          <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-sharp)] bg-[var(--paper-100)]">
            <Image src={imageUrl} alt={share.title} fill className="object-contain" unoptimized />
          </div>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center rounded-[var(--radius-sharp)] bg-[var(--paper-100)] text-[var(--ink-400)]">
            <ImageIcon className="size-10" />
          </div>
        )}
        <TextBlock title="创作说明">
          <p className="text-base leading-8 text-[var(--ink-700)]">{String(data.prompt_used || data.prompt || data.ai_result || share.preview_text || "未记录提示词")}</p>
        </TextBlock>
      </div>
    )
  }

  if (share.content_type === "flashcard_deck") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-[var(--radius-sharp)] bg-[var(--ink-50)] p-4 text-[var(--ink-800)]">
          <BookOpenCheck className="size-6" />
          <div>
            <p className="font-semibold">{String(data.deck_name || share.title)}</p>
            <p className="text-sm">共 {Number(data.total_cards || (Array.isArray(data.cards) ? data.cards.length : 0))} 张闪卡</p>
          </div>
        </div>
        <FlashcardPreview cards={Array.isArray(data.cards) ? data.cards as Array<{ question?: string; answer?: string; difficulty?: number }> : []} />
      </div>
    )
  }

  if (share.content_type === "manim_video") {
    return (
      <div className="space-y-4">
        {data.video_url ? <video src={String(data.video_url)} controls className="w-full rounded-[var(--radius-sharp)] bg-black" /> : null}
        <TextBlock title="数学动画说明">
          <div className="flex items-center gap-2 font-medium text-[var(--ink-900)]"><Video className="size-4" />{String(data.topic || share.title)}</div>
          <p className="mt-2 text-base leading-8 text-[var(--ink-700)]">{share.preview_text}</p>
        </TextBlock>
      </div>
    )
  }

  if (share.content_type === "ppt_summary") {
    return (
      <TextBlock title="PPT 摘要">
        <div className="flex items-center gap-2 font-medium text-[var(--ink-900)]"><Presentation className="size-4" />{String(data.original_filename || share.title)}</div>
        <p className="mt-3 text-base leading-8 text-[var(--ink-700)]">{String(data.summary || share.preview_text || "")}</p>
        {Array.isArray(data.key_points) ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-7 text-[var(--ink-700)]">
            {data.key_points.slice(0, 8).map((item, index) => <li key={index}>{String(item)}</li>)}
          </ul>
        ) : null}
      </TextBlock>
    )
  }

  if (share.content_type === "quiz_result") {
    return (
      <TextBlock title="练习结果">
        <div className="flex items-center gap-2 font-medium text-[var(--ink-900)]"><Trophy className="size-4" />练习结果</div>
        <p className="mt-2 text-2xl font-semibold text-[var(--ink-700)]">{Number(data.score || 0)} 分</p>
        <p className="mt-2 text-base leading-8 text-[var(--ink-700)]">答对 {Number(data.correct_count || 0)} / {Number(data.total_questions || 0)} 题</p>
      </TextBlock>
    )
  }

  const hasWorkContent = Boolean(getAssistantResult(data) || share.preview_text)
  if (hasWorkContent) return <WorkArticle share={share} />

  return (
    <TextBlock title="内容预览">
      <div className="flex items-center gap-2 font-medium text-[var(--ink-900)]"><MessageSquareText className="size-4" />学习作品</div>
      <p className="mt-2 whitespace-pre-wrap text-base leading-8 text-[var(--ink-700)]">{share.preview_text || JSON.stringify(data, null, 2)}</p>
    </TextBlock>
  )
}
