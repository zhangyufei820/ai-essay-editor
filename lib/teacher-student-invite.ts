import { createHmac, timingSafeEqual } from "crypto"

import { isSupabaseUuid } from "@/lib/learning-user"

const TEACHER_STUDENT_INVITE_TTL_MS = 15 * 60 * 1000
const MAX_CLASS_NAME_LENGTH = 100

type TeacherStudentInvitePayload = {
  v: 1
  kind: "teacher-student-invite"
  teacherId: string
  className: string | null
  expiresAt: number
}

type TeacherStudentInviteParams = {
  teacherId: string
  className?: string | null
  now?: number
}

function getInviteSecret() {
  return process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || ""
}

function normalizeClassName(value: unknown) {
  if (typeof value !== "string") return null
  const className = value.trim()
  return className ? className.slice(0, MAX_CLASS_NAME_LENGTH) : null
}

function safeTimingEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function decodePayload(encoded: string) {
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
    return value && typeof value === "object" ? value as Partial<TeacherStudentInvitePayload> : null
  } catch {
    return null
  }
}

export function signTeacherStudentInvite(params: TeacherStudentInviteParams) {
  const secret = getInviteSecret()
  if (!secret || !isSupabaseUuid(params.teacherId)) return ""

  const payload: TeacherStudentInvitePayload = {
    v: 1,
    kind: "teacher-student-invite",
    teacherId: params.teacherId,
    className: normalizeClassName(params.className),
    expiresAt: (params.now ?? Date.now()) + TEACHER_STUDENT_INVITE_TTL_MS,
  }
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url")
  return `${encoded}.${signature}`
}

export function verifyTeacherStudentInvite(token: unknown, now = Date.now()) {
  const secret = getInviteSecret()
  if (!secret || typeof token !== "string") return null

  const [encoded, signature, extra] = token.trim().split(".")
  if (!encoded || !signature || extra !== undefined) return null

  const expectedSignature = createHmac("sha256", secret).update(encoded).digest("base64url")
  if (!safeTimingEqual(signature, expectedSignature)) return null

  const payload = decodePayload(encoded)
  if (
    payload?.v !== 1
    || payload.kind !== "teacher-student-invite"
    || !isSupabaseUuid(payload.teacherId)
    || typeof payload.expiresAt !== "number"
    || payload.expiresAt <= now
  ) return null

  return {
    teacherId: payload.teacherId,
    className: normalizeClassName(payload.className),
    expiresAt: payload.expiresAt,
  }
}
