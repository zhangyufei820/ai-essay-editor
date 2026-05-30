function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function isTeacherKitControlPayload(value: unknown) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).skill === "teacher-kit-v4",
  )
}

function stripTeacherKitJsonObjects(text: string) {
  let result = ""
  let segmentStart = 0
  let objectStart = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === "\"") {
        inString = false
      }
      continue
    }

    if (char === "\"") {
      inString = true
      continue
    }

    if (char === "{") {
      if (depth === 0) objectStart = index
      depth += 1
      continue
    }

    if (char !== "}" || depth === 0) continue

    depth -= 1
    if (depth !== 0 || objectStart < 0) continue

    const candidate = text.slice(objectStart, index + 1)
    if (isTeacherKitControlPayload(safeJsonParse(candidate))) {
      result += text.slice(segmentStart, objectStart)
      segmentStart = index + 1
    }
    objectStart = -1
  }

  return result + text.slice(segmentStart)
}

function stripTeacherKitMetadataLines(text: string) {
  return text
    .replace(/^\s*skill_selected\s*:\s*teacher-kit-v4\s*$/gim, "")
    .replace(/^\s*skill_trigger_reason\s*:\s*.*$/gim, "")
    .replace(/^\s*skill_(?:id|name|display_name|description|category|tags)\s*:\s*.*$/gim, "")
}

function stripTeacherKitFencedJson(text: string) {
  return text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, (match, inner) => {
    const parsed = safeJsonParse(String(inner).trim())
    return isTeacherKitControlPayload(parsed) ? "" : match
  })
}

function normalizeBlankLines(text: string) {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function cleanBeikeProAnswer(answer: string) {
  if (!answer || typeof answer !== "string") return ""
  return normalizeBlankLines(
    stripTeacherKitMetadataLines(
      stripTeacherKitJsonObjects(
        stripTeacherKitFencedJson(answer),
      ),
    ),
  )
}

export function sanitizeDifyAnswerForModel(answer: string, model?: string | null) {
  if (model === "beike-pro") return cleanBeikeProAnswer(answer)
  return answer
}
