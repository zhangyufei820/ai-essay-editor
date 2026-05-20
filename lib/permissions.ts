import type { MembershipTier } from "@/lib/billing-config"

export type MembershipSource = {
  membership_status?: string | null
  is_pro?: boolean | null
} | null | undefined

export type Image2PermissionUser = {
  id?: string | null
  user_id?: string | null
  email?: string | null
  membership_status?: string | null
  is_pro?: boolean | null
} | null | undefined

export function parseAllowlistEnv(raw?: string): string[] {
  return (raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function isSubscribedUser(membershipStatus: string | null): membershipStatus is MembershipTier {
  return membershipStatus === "basic" ||
    membershipStatus === "pro" ||
    membershipStatus === "premium" ||
    membershipStatus === "enterprise" ||
    membershipStatus === "campus"
}

function parseTimestampMs(value?: string): number | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

export function isImage2CoCreationActive(now = Date.now()): boolean {
  const endsAtMs = parseTimestampMs(process.env.IMAGE2_CO_CREATION_ENDS_AT)
  if (endsAtMs !== null) return now <= endsAtMs
  return process.env.IMAGE2_TEST_OPEN_ACCESS === "true"
}

export function resolveMembershipStatus(source?: MembershipSource): MembershipTier | null {
  if (!source) return null

  const explicitStatus = source.membership_status || null
  if (isSubscribedUser(explicitStatus)) {
    return explicitStatus
  }

  if (source.is_pro) {
    return "pro"
  }

  return null
}

function isAllowlistedUserId(userId?: string | null): boolean {
  if (!userId) return false
  return [
    ...parseAllowlistEnv(process.env.IMAGE2_WHITELIST_USER_IDS),
    ...parseAllowlistEnv(process.env.GPT_IMAGE_2_ALLOWLIST),
  ].includes(userId)
}

function isAllowlistedEmail(email?: string | null): boolean {
  if (!email) return false
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return false
  return parseAllowlistEnv(process.env.IMAGE2_WHITELIST_EMAILS)
    .map((item) => item.toLowerCase())
    .includes(normalizedEmail)
}

export function canUseImage2(user?: Image2PermissionUser, now = Date.now()): boolean {
  if (!user) return false
  const userId = user.id || user.user_id || null
  if (!userId) return false
  if (isImage2CoCreationActive(now)) return true
  if (isSubscribedUser(user.membership_status || null)) return true
  if (isAllowlistedUserId(userId)) return true
  if (isAllowlistedEmail(user.email)) return true
  return false
}
