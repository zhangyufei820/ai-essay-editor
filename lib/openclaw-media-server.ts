import "server-only"

import { createHmac, timingSafeEqual } from "crypto"

import { toPublicOpenClawMediaUrl } from "@/lib/openclaw-media"

const DEFAULT_OPENCLAW_MEDIA_TTL_SECONDS = 60 * 60

function getSigningSecret() {
  return (
    process.env.OPENCLAW_MEDIA_SIGNING_SECRET ||
    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY ||
    ""
  )
}

function signPayload(payload: string) {
  const secret = getSigningSecret()
  if (!secret) return ""

  return createHmac("sha256", secret).update(payload).digest("hex")
}

function signingPayload(mediaPath: string, exp: number, userId: string) {
  return `${userId}:${mediaPath}:${exp}`
}

export function createSignedOpenClawMediaUrl(
  mediaPath: string,
  expiresInSeconds = DEFAULT_OPENCLAW_MEDIA_TTL_SECONDS,
  userId: string,
) {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds
  const baseUrl = toPublicOpenClawMediaUrl(mediaPath)
  const sig = signPayload(signingPayload(mediaPath, exp, userId))

  if (!sig) return baseUrl
  return `${baseUrl}?exp=${exp}&sig=${sig}`
}

export function rewriteOpenClawMediaReferencesWithSignedUrls(
  text: string,
  expiresInSeconds = DEFAULT_OPENCLAW_MEDIA_TTL_SECONDS,
  userId: string,
) {
  return text
    .replace(/https?:\/\/(?:43\.154\.111\.156|shenxiang\.school|www\.shenxiang\.school|api\.shenxiang\.school|cloudflare\.shenxiang\.school|localhost|127\.0\.0\.1)(?::18789)?\/__openclaw__\/media\/([^\s)"'<>`]+)/g, (_match, mediaPath: string) =>
      createSignedOpenClawMediaUrl(mediaPath, expiresInSeconds, userId),
    )
    .replace(/\/home\/node\/\.openclaw\/media\/([^\s)"'<>`]+)/g, (_match, mediaPath: string) =>
      createSignedOpenClawMediaUrl(mediaPath, expiresInSeconds, userId),
    )
}

export function verifySignedOpenClawMediaPath(
  mediaPath: string,
  exp: string | null,
  sig: string | null,
  userId: string,
) {
  if (!exp || !sig) return false

  const expNumber = Number(exp)
  if (!Number.isFinite(expNumber) || expNumber < Math.floor(Date.now() / 1000)) {
    return false
  }

  const expected = signPayload(signingPayload(mediaPath, expNumber, userId))
  if (!expected) return false

  const provided = Buffer.from(sig, "hex")
  const target = Buffer.from(expected, "hex")

  if (provided.length !== target.length) return false
  return timingSafeEqual(provided, target)
}
