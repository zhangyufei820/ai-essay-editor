import { createHmac, timingSafeEqual } from "crypto"

const WORKSHEET_POSTER_TOKEN_TTL_MS = 30 * 60 * 1000

type WorksheetPosterTokenPayload = {
  v: 1
  kind: "worksheet-poster"
  userHash: string
  diagnosisRequestId: string
  promptHash: string
  expiresAt: number
}

export type WorksheetPosterTokenParams = {
  userId: string
  diagnosisRequestId: string
  renderPrompt: string
  now?: number
}

function getWorksheetPosterTokenSecret() {
  return process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.DIFY_IMAGE_GATEWAY_TOKEN
    || ""
}

function encodeTokenPayload(payload: WorksheetPosterTokenPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
}

function decodeTokenPayload(encoded: string) {
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8")
    const payload = JSON.parse(json)
    return payload && typeof payload === "object" ? payload as Partial<WorksheetPosterTokenPayload> : null
  } catch {
    return null
  }
}

function safeTimingEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function hashWithSecret(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest("hex")
}

function compactHash(secret: string, value: string) {
  return hashWithSecret(secret, value).slice(0, 32)
}

export function signWorksheetPosterToken(params: WorksheetPosterTokenParams) {
  const secret = getWorksheetPosterTokenSecret()
  if (!secret) return ""

  const encoded = encodeTokenPayload({
    v: 1,
    kind: "worksheet-poster",
    userHash: compactHash(secret, params.userId),
    diagnosisRequestId: params.diagnosisRequestId,
    promptHash: hashWithSecret(secret, params.renderPrompt),
    expiresAt: (params.now ?? Date.now()) + WORKSHEET_POSTER_TOKEN_TTL_MS,
  })
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url")
  return `${encoded}.${signature}`
}

export function verifyWorksheetPosterToken(token: string | null | undefined, params: WorksheetPosterTokenParams) {
  const secret = getWorksheetPosterTokenSecret()
  if (!secret || !token) return false

  const [encoded, signature, extra] = token.split(".")
  if (!encoded || !signature || extra !== undefined) return false

  const expectedSignature = createHmac("sha256", secret).update(encoded).digest("base64url")
  if (!safeTimingEqual(signature, expectedSignature)) return false

  const payload = decodeTokenPayload(encoded)
  const expiresAt = typeof payload?.expiresAt === "number" ? payload.expiresAt : 0
  return (
    payload?.v === 1 &&
    payload.kind === "worksheet-poster" &&
    payload.userHash === compactHash(secret, params.userId) &&
    payload.diagnosisRequestId === params.diagnosisRequestId &&
    payload.promptHash === hashWithSecret(secret, params.renderPrompt) &&
    expiresAt > (params.now ?? Date.now())
  )
}
