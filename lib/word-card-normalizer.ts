import { getVocabOutputs, parseFrontendWordCard } from "@/lib/vocab-card-workflow"

export type FrontendWordCard = {
  schema_version: string
  render_mode: string
  status: string
  word: string
  hero: any
  sections: any
  quality: any
  ui: any
  card?: any
}

export function safeJsonParse(value: unknown): any {
  if (!value) return null
  if (typeof value === "object") return value
  if (typeof value !== "string") return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function containsRawDifyWordCardPayload(value: unknown): boolean {
  if (typeof value !== "string") return false
  const trimmed = value.trim()
  if (!trimmed) return false
  return (
    /^success\s*[\{\[]/.test(trimmed) ||
    /^[\{\[]/.test(trimmed) ||
    trimmed.includes("frontend_card_json") ||
    trimmed.includes("card_json_text") ||
    trimmed.includes("quality_report") ||
    trimmed.includes("tts_response")
  )
}

function asArray(value: unknown): any[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function firstDefined<T>(...values: T[]): T | undefined {
  return values.find((value) => value !== undefined && value !== null)
}

function parseEmbeddedJson(value: unknown): any {
  if (typeof value !== "string") return null
  const start = value.indexOf("{")
  const end = value.lastIndexOf("}")
  if (start === -1 || end <= start) return null
  return safeJsonParse(value.slice(start, end + 1))
}

export function convertCardJsonToFrontendCard(cardData: any): FrontendWordCard | null {
  const rawCard = cardData?.card || cardData
  if (!rawCard || typeof rawCard !== "object") return null

  const word = firstDefined(rawCard.word, cardData?.word, "") || ""
  const meaning = rawCard.meaning || rawCard.hero || {}
  const pronunciation = rawCard.pronunciation || {}
  const spelling = rawCard.spelling || {}
  const memoryStory = rawCard.memory_story || rawCard.memoryStory || rawCard.story || {}
  const review = rawCard.review || {}
  const quickMemory = rawCard.quick_memory || rawCard.quickMemory || {}
  const quality = cardData?.quality || cardData?.quality_control || rawCard.quality || {}
  const audioUrl = firstDefined(
    rawCard.audio?.audio_url,
    pronunciation.audio?.audio_url,
    pronunciation.audio_url,
    cardData?.audio_url
  )
  const audioStatus = firstDefined(rawCard.audio?.status, pronunciation.audio?.status, cardData?.tts_status)

  return {
    schema_version: "word_card_frontend_v1",
    render_mode: "premium_word_card",
    status: firstDefined(cardData?.status, rawCard.status, "success") || "success",
    word: String(word),
    hero: {
      icon: firstDefined(rawCard.icon, meaning.icon, "Aa"),
      primary_cn: firstDefined(meaning.primary_cn, rawCard.primary_cn, rawCard.translation),
      simple_en: firstDefined(meaning.simple_en, rawCard.simple_en, rawCard.definition),
      part_of_speech: firstDefined(rawCard.part_of_speech, rawCard.pos, meaning.part_of_speech),
      ipa: firstDefined(rawCard.ipa, pronunciation.ipa, {}),
      frequency: firstDefined(rawCard.frequency, {}),
      exam_tags: firstDefined(rawCard.exam_tags, rawCard.frequency?.exam_tags, [])
    },
    sections: {
      pronunciation: {
        tts_text: firstDefined(pronunciation.tts_text, cardData?.tts_text, word),
        stress: pronunciation.stress,
        phonics_tip_cn: pronunciation.phonics_tip_cn,
        mouth_shape_tip_cn: pronunciation.mouth_shape_tip_cn,
        common_mistakes: firstDefined(pronunciation.common_mistakes, pronunciation.common_pronunciation_mistakes, []),
        audio: {
          audio_url: audioUrl,
          status: audioStatus
        }
      },
      spelling: {
        chunks: asArray(spelling.chunks),
        formula: firstDefined(spelling.formula, spelling.spelling_formula),
        rule_cn: spelling.rule_cn,
        anti_mistake_tip_cn: spelling.anti_mistake_tip_cn,
        common_mistakes: asArray(spelling.common_mistakes)
      },
      memory_story: {
        story_title_cn: firstDefined(memoryStory.story_title_cn, memoryStory.title_cn),
        story_cn: memoryStory.story_cn,
        visual_scene_cn: memoryStory.visual_scene_cn,
        keywords: asArray(memoryStory.keywords)
      },
      examples: {
        items: asArray(rawCard.examples || cardData?.examples)
      },
      review: {
        front_question_cn: review.front_question_cn,
        back_answer_cn: review.back_answer_cn,
        cloze_test: review.cloze_test,
        self_check_questions: asArray(review.self_check_questions)
      },
      quick_memory: {
        one_sentence_cn: quickMemory.one_sentence_cn,
        chant_cn: quickMemory.chant_cn,
        three_second_hook_cn: quickMemory.three_second_hook_cn
      }
    },
    quality: {
      passed: firstDefined(quality.passed, quality.final_passed, quality.ok, false),
      score: firstDefined(quality.score, quality.final_score),
      summary_cn: firstDefined(quality.summary_cn, quality.summary)
    },
    ui: {
      badges: {
        quality: cardData?.ui?.badges?.quality,
        tts: cardData?.ui?.badges?.tts
      }
    },
    card: rawCard
  }
}

export function normalizeDifyWordCardResponse(result: any): FrontendWordCard | null {
  const parsedResult = typeof result === "string" ? (safeJsonParse(result) || parseEmbeddedJson(result)) : result
  const source = parsedResult || result
  const outputs = getVocabOutputs(source)

  return parseFrontendWordCard(outputs?.frontend_card_json || source?.frontend_card_json)
}
