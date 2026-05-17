import type { EssayReviewArtifact } from "@/components/chat/v2/types"

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    const value = match?.[1]?.trim()
    if (value) return value
  }
  return ""
}

function sectionBlock(markdown: string, names: string[]) {
  const heading = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
  const pattern = new RegExp(`(?:^|\\n)#{1,4}\\s*(?:${heading})[^\\n]*\\n([\\s\\S]*?)(?=\\n#{1,4}\\s+|$)`, "i")
  return markdown.match(pattern)?.[1]?.trim() || ""
}

function listItems(block: string) {
  return block
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)、]|[一二三四五六七八九十]+[、.)])\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 8)
}

function extractInlineItems(markdown: string, labels: string[]) {
  const items: string[] = []
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[：:]\\s*([^\\n]+)`, "gi")
    for (const match of markdown.matchAll(pattern)) {
      const value = match[1]?.trim()
      if (value) items.push(value)
    }
  }
  return items.slice(0, 8)
}

function parseScore(markdown: string): EssayReviewArtifact["score"] | undefined {
  const ratio = markdown.match(/(?:评分|得分|总分)\s*[：:]?\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/i)
  if (ratio) {
    return { value: Number(ratio[1]), total: Number(ratio[2]) }
  }

  const score = markdown.match(/(?:评分|得分|总分)\s*[：:]?\s*(\d+(?:\.\d+)?)\s*分/i)
  if (score) {
    return { value: Number(score[1]), total: 100 }
  }

  return undefined
}

function parseDiagnosis(markdown: string) {
  const block = sectionBlock(markdown, ["问题诊断", "问题分析", "主要问题", "诊断"])
  const candidates = listItems(block).length ? listItems(block) : extractInlineItems(markdown, ["问题\\s*\\d*", "问题"])

  return candidates.map((item, index) => {
    const [title, ...rest] = item.split(/[：:]/)
    const detail = rest.join(":").trim()
    return {
      title: detail ? title.trim() : `问题 ${index + 1}`,
      detail: detail || item,
    }
  })
}

export function parseEssayReview(markdown: string): EssayReviewArtifact | null {
  const text = markdown.trim()
  if (!text) return null

  const hasReviewMarkers = /评分|得分|问题诊断|修改建议|今日训练|训练任务|作文批改|已批阅/.test(text)
  if (!hasReviewMarkers) return null

  const title =
    firstMatch(text, [/^#\s+(.+)$/m, /题目\s*[：:]\s*([^\n]+)/, /作文题目\s*[：:]\s*([^\n]+)/]) ||
    "作文批改报告"

  const score = parseScore(text)
  const summary = firstMatch(text, [
    /(?:总体评价|综合评价|评语|总结)\s*[：:]\s*([^\n]+)/,
    /#{1,4}\s*(?:总体评价|综合评价|评语|总结)[^\n]*\n([^\n]+)/,
  ])

  const diagnosis = parseDiagnosis(text)
  const suggestionBlock = sectionBlock(text, ["修改建议", "提升建议", "升格建议", "建议"])
  const suggestions = listItems(suggestionBlock).length
    ? listItems(suggestionBlock)
    : extractInlineItems(text, ["建议"])

  const trainingBlock = sectionBlock(text, ["今日训练", "训练任务", "训练", "练习"])
  const trainingTasks = listItems(trainingBlock).length
    ? listItems(trainingBlock)
    : extractInlineItems(text, ["训练"])

  const finalDraft = sectionBlock(text, ["修改后定稿", "最终定稿", "升格范文", "范文"])

  if (!score && diagnosis.length === 0 && suggestions.length === 0 && trainingTasks.length === 0) {
    return null
  }

  return {
    type: "essay-review",
    title,
    score,
    summary: summary || undefined,
    diagnosis: diagnosis.length ? diagnosis : undefined,
    suggestions: suggestions.length ? suggestions : undefined,
    trainingTasks: trainingTasks.length ? trainingTasks : undefined,
    finalDraft: finalDraft || undefined,
    rawMarkdown: text,
  }
}
