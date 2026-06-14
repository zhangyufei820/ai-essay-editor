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

function stripSkillMetadataLines(text: string) {
  return text
    .replace(/^\s*skill_trigger_reason\s*:\s*.*$/gim, "")
    .replace(/^\s*skill_(?:selected|id|name|display_name|description|category|tags)\s*:\s*.*$/gim, "")
}

export function hasUsefulOpenClawResult(text: string) {
  return (
    /\[[^\]]*(?:演示文稿|PPT|课件|查看|打开)[^\]]*\]\([^)]+\)/i.test(text) ||
    /(?:已生成|生成完成|可直接查看|点击查看|查看演示文稿|演示文稿|PPT|课件)/i.test(text) ||
    /(?:\/slides\/|__openclaw__\/workspace\/|\/home\/node\/\.openclaw\/workspace\/)[^\s)"'<>`]+/i.test(text)
  )
}

function stripTransientOpenClawUnavailable(text: string) {
  const withoutSkillDebugPrefix = text
    .replace(/服务暂时不可用，请稍后重试。?\s*(?=skill_trigger_reason\s*:)/gi, "")
    .replace(/智能服务暂时不可用，请稍后重试。?\s*(?=skill_trigger_reason\s*:)/gi, "")

  if (!hasUsefulOpenClawResult(withoutSkillDebugPrefix)) return withoutSkillDebugPrefix

  return withoutSkillDebugPrefix
    .replace(/^\s*服务暂时不可用，请稍后重试。?\s*$/gim, "")
    .replace(/^\s*智能服务暂时不可用，请稍后重试。?\s*$/gim, "")
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

export function cleanOpenClawAnswer(answer: string) {
  if (!answer || typeof answer !== "string") return ""
  return normalizeBlankLines(
    stripSkillMetadataLines(
      stripTransientOpenClawUnavailable(answer),
    ),
  )
}

export function sanitizeDifyAnswerForModel(answer: string, model?: string | null) {
  if (model === "beike-pro") return cleanBeikeProAnswer(answer)
  if (model === "open-claw") return cleanOpenClawAnswer(answer)
  return answer
}
