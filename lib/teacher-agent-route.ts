import type { ModelType } from "@/lib/pricing"

export const TEACHER_AGENT_MODEL: ModelType = "teacher-agent"

const AGENT_TO_MODEL: Record<string, ModelType> = {
  standard: "standard",
  "general-chat": "general-chat",
  "teaching-pro": "teaching-pro",
  "gpt-5": "gpt-5",
  "claude-opus": "claude-opus",
  "gemini-pro": "gemini-pro",
  "gemini-image": "gemini-image",
  "suno-v5": "suno-v5",
  "grok-4.2": "grok-4.2",
  "open-claw": "open-claw",
  "all-in-one-agent": "all-in-one-agent",
  "quanquan-math": "quanquan-math",
  "quanquan-english": "quanquan-english",
  "vocab-card": "vocab-card",
  problem: "problem",
  "beike-pro": "beike-pro",
  banzhuren: "banzhuren",
  "ai-writing-paper": "ai-writing-paper",
  "zhongying-essay": "zhongying-essay",
  "reading-report": "reading-report",
  "experiment-report": "experiment-report",
  "study-abroad": "study-abroad",
  "resume-optimize": "resume-optimize",
  "speech-defense": "speech-defense",
  "school-wechat": "school-wechat",
  "banana-2-pro": "banana-2-pro",
  "gpt-image-2": "gpt-image-2",
  "gpt-image-1": "gpt-image-1",
}

const TEACHER_SHARE_CODE_PATTERN = /^[a-zA-Z0-9]{6,32}$/

export function resolveChatAgentParam(agent?: string | null): {
  model: ModelType | null
  teacherAgentShareCode: string | null
} {
  const value = agent?.trim()
  if (!value) return { model: null, teacherAgentShareCode: null }

  const builtInModel = AGENT_TO_MODEL[value]
  if (builtInModel) return { model: builtInModel, teacherAgentShareCode: null }

  if (TEACHER_SHARE_CODE_PATTERN.test(value)) {
    return { model: TEACHER_AGENT_MODEL, teacherAgentShareCode: value }
  }

  return { model: null, teacherAgentShareCode: null }
}
