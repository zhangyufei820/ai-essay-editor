import type { FrontendWordCard } from "@/lib/word-card-normalizer"

const VOCAB_LEVELS = new Set(["primary", "middle", "high", "cet4", "cet6", "postgraduate", "ielts", "toefl", "general"])
const VOCAB_STYLES = new Set(["minimal", "colorful", "academic", "comic", "exam", "story", "root"])

export type VocabCardWorkflowInputs = {
  user_message: string
  word: string
  current_word: string
  level: string
  style: string
  language: string
}

export type VocabCardResult = {
  answer: string
  frontendCard: FrontendWordCard | null
  currentWord: string
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function pick(value: unknown, fallback: string): string {
  const nextValue = text(value)
  return nextValue || fallback
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

export function cleanVocabAnswer(value: unknown): string {
  if (!value) return ""
  return String(value)
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .trim()
}

export function buildVocabCardWorkflowInputs({
  query,
  inputs,
  fallbackCurrentWord = "",
}: {
  query?: unknown
  inputs?: unknown
  fallbackCurrentWord?: string
}): VocabCardWorkflowInputs {
  const record = inputs && typeof inputs === "object" ? inputs as Record<string, unknown> : {}
  const userMessage = hasOwn(record, "user_message") ? text(record.user_message) : text(query)
  const word = text(record.word)
  const currentWord = hasOwn(record, "current_word") ? text(record.current_word) : text(fallbackCurrentWord)
  const level = pick(record.level, "high")
  const style = pick(record.style, "colorful")

  return {
    user_message: userMessage,
    word,
    current_word: currentWord,
    level: VOCAB_LEVELS.has(level) ? level : "high",
    style: VOCAB_STYLES.has(style) ? style : "colorful",
    language: pick(record.language, "zh-CN"),
  }
}

export function getVocabOutputs(result: any): Record<string, any> {
  const parsedResult = typeof result === "string"
    ? (() => {
        try {
          return JSON.parse(result)
        } catch {
          return null
        }
      })()
    : result
  const outputs =
    parsedResult?.data?.outputs ||
    parsedResult?.outputs ||
    parsedResult?.data ||
    parsedResult
  return outputs && typeof outputs === "object" ? outputs : {}
}

export function parseFrontendWordCard(value: unknown): FrontendWordCard | null {
  let parsed = value
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      return null
    }
  }

  if (!parsed || typeof parsed !== "object") return null
  const card = parsed as FrontendWordCard
  if (card.render_mode === "premium_word_card" || typeof card.word === "string") {
    return card
  }
  return null
}

export function resolveVocabCardResult(result: any, previousCurrentWord = ""): VocabCardResult {
  const outputs = getVocabOutputs(result)
  const frontendCard = parseFrontendWordCard(outputs.frontend_card_json)
  const answer = cleanVocabAnswer(outputs.answer || outputs.text || outputs.result)
  const nextCurrentWord =
    text(outputs.current_word) ||
    text(outputs.word) ||
    text(frontendCard?.word) ||
    text(previousCurrentWord)

  return {
    answer,
    frontendCard,
    currentWord: nextCurrentWord,
  }
}
