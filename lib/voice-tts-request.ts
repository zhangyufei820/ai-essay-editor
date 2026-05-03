export type VoiceTtsPayload = {
  text: string
  voice: string
  format: string
  instructions?: string
}

const DEFAULT_VOICE = "coral"
const DEFAULT_FORMAT = "mp3"

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeVoice(value: unknown): string {
  const voice = asText(value)
  if (!voice) return DEFAULT_VOICE
  if (/^en-[A-Z]{2}-.*Neural$/i.test(voice)) return DEFAULT_VOICE
  return voice
}

export function resolveVoiceTtsPayload(body: unknown, maxTextLength: number): VoiceTtsPayload {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {}
  const text =
    asText(record.text) ||
    asText(record.tts_text) ||
    asText(record.word) ||
    asText(record.tts_word)

  return {
    text: text.slice(0, maxTextLength),
    voice: normalizeVoice(record.voice),
    format: asText(record.format) || DEFAULT_FORMAT,
    instructions: asText(record.instructions) || undefined,
  }
}
