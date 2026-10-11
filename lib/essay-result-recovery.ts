import { sanitizeAssistantMessageForPublicDisplay } from "@/lib/chat-error-sanitizer"
import { sanitizeDifyAnswerForModel } from "@/lib/dify-answer-cleanup"
import { isValidEssayCorrectionResult } from "@/lib/essay-correction-result"

type DifyMessage = {
  id?: unknown
  conversation_id?: unknown
  created_at?: unknown
  status?: unknown
  answer?: unknown
}

/** Match one upstream message to one task; never return a nearby user's other report. */
export function selectRecoveredEssayResult(
  messages: unknown,
  task: { conversation_id?: string | null; created_at?: string | null; upstream_task_id?: string | null },
): string | null {
  if (!Array.isArray(messages) || !task.conversation_id || !task.created_at) return null
  const createdSeconds = Date.parse(task.created_at) / 1000
  if (!Number.isFinite(createdSeconds)) return null

  const candidates = (messages as DifyMessage[]).filter((message) => {
    if (message.conversation_id !== task.conversation_id) return false
    if (task.upstream_task_id && message.id !== task.upstream_task_id) return false
    const messageSeconds = Number(message.created_at)
    return Number.isFinite(messageSeconds) && Math.abs(messageSeconds - createdSeconds) <= 15
  })
  if (candidates.length !== 1) return null

  const message = candidates[0]
  if (message.status !== "normal" || typeof message.answer !== "string") return null
  const answer = sanitizeAssistantMessageForPublicDisplay(sanitizeDifyAnswerForModel(message.answer, "standard"))
  return isValidEssayCorrectionResult(answer) ? answer : null
}
