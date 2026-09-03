import { createHash } from "node:crypto"

type DifyServiceUserInput = {
  model: string | null | undefined
  userId: string
  sessionId: unknown
  conversationId: unknown
}

function readScope(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function buildDifyServiceUser(input: DifyServiceUserInput) {
  if (input.model !== "open-claw") return input.userId || "default-user"

  const scope = readScope(input.sessionId) || readScope(input.conversationId)
  if (!scope) return input.userId || "default-user"

  const digest = createHash("sha256")
    .update(input.userId)
    .update("\0")
    .update(scope)
    .digest("hex")
    .slice(0, 40)

  return `openclaw-${digest}`
}
