export const FLASHCARD_SUBJECTS = [
  "math",
  "english",
  "physics",
  "chemistry",
  "biology",
  "history",
  "geography",
  "politics",
  "other",
] as const

export const FLASHCARD_DIFFICULTY_LEVELS = ["basic", "intermediate", "advanced"] as const

const FLASHCARD_TYPES = ["fact", "concept", "formula", "process", "comparison"] as const

export type FlashcardSubject = (typeof FLASHCARD_SUBJECTS)[number]
export type FlashcardDifficultyLevel = (typeof FLASHCARD_DIFFICULTY_LEVELS)[number]
export type GeneratedFlashcardType = (typeof FLASHCARD_TYPES)[number]

export type GeneratedFlashcard = {
  question: string
  answer: string
  difficulty: number
  tags: string[]
  type: GeneratedFlashcardType
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function isSubject(value: unknown): value is FlashcardSubject {
  return typeof value === "string" && (FLASHCARD_SUBJECTS as readonly string[]).includes(value)
}

function isDifficultyLevel(value: unknown): value is FlashcardDifficultyLevel {
  return typeof value === "string" && (FLASHCARD_DIFFICULTY_LEVELS as readonly string[]).includes(value)
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, maxLength)
}

function normalizeDifficulty(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric)) return 3
  return Math.min(5, Math.max(1, Math.round(numeric)))
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function normalizeType(value: unknown): GeneratedFlashcardType {
  return typeof value === "string" && (FLASHCARD_TYPES as readonly string[]).includes(value)
    ? value as GeneratedFlashcardType
    : "fact"
}

export function normalizeSubject(value: unknown): FlashcardSubject | null {
  return isSubject(value) ? value : null
}

export function normalizeDifficultyLevel(value: unknown): FlashcardDifficultyLevel {
  return isDifficultyLevel(value) ? value : "basic"
}

export function normalizeCardCount(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric)) return 10
  return Math.min(30, Math.max(3, Math.floor(numeric)))
}

export function createDeckName(subject: FlashcardSubject, date = new Date()) {
  return `${subject}-${date.toISOString().slice(0, 10)}`
}

export function parseGeneratedFlashcards(raw: unknown): GeneratedFlashcard[] | null {
  let parsed = raw

  if (typeof raw === "string") {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")

    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return null
    }
  }

  const cardsInput = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.cards)
      ? parsed.cards
      : null

  if (!cardsInput) return null

  const cards = cardsInput
    .map((item): GeneratedFlashcard | null => {
      if (!isRecord(item)) return null
      const question = normalizeText(item.question, 1000)
      const answer = normalizeText(item.answer, 2000)
      if (!question || !answer) return null

      return {
        question,
        answer,
        difficulty: normalizeDifficulty(item.difficulty),
        tags: normalizeTags(item.tags),
        type: normalizeType(item.type),
      }
    })
    .filter((card): card is GeneratedFlashcard => Boolean(card))

  return cards.length > 0 ? cards : null
}
