export const USER_PROFILE_UPDATED_EVENT = "shenxiang-user-updated"

export type ClientUserProfile = {
  name?: string
  avatar?: string
  email?: string
  phone?: string
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

export function normalizeClientUserProfile(user: unknown): ClientUserProfile | null {
  if (!user || typeof user !== "object") return null
  const record = user as Record<string, unknown>
  const metadata = record.user_metadata && typeof record.user_metadata === "object"
    ? record.user_metadata as Record<string, unknown>
    : {}
  const nestedUser = record.user && typeof record.user === "object"
    ? record.user as Record<string, unknown>
    : {}
  const nestedMetadata = nestedUser.user_metadata && typeof nestedUser.user_metadata === "object"
    ? nestedUser.user_metadata as Record<string, unknown>
    : {}

  const name = firstString(
    metadata.name,
    metadata.nickname,
    record.nickname,
    record.name,
    record.display_name,
    record.username,
    nestedMetadata.name,
    nestedUser.name,
    record.email,
    nestedUser.email,
    record.phone,
    nestedUser.phone,
  )

  return {
    name: name || "我的账户",
    email: firstString(record.email, nestedUser.email),
    phone: firstString(record.phone, record.phone_number, nestedUser.phone, nestedUser.phone_number),
    avatar: firstString(
      record.avatar,
      record.avatar_url,
      record.avatarUrl,
      record.photo,
      record.picture,
      metadata.avatar_url,
      metadata.avatar,
      metadata.picture,
      nestedUser.avatar,
      nestedUser.avatar_url,
      nestedUser.photo,
      nestedUser.picture,
      nestedMetadata.avatar_url,
      nestedMetadata.picture,
    ),
  }
}

export function readClientUserProfile(): ClientUserProfile | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem("currentUser")
    if (!raw) return null
    return normalizeClientUserProfile(JSON.parse(raw))
  } catch {
    window.localStorage.removeItem("currentUser")
    return null
  }
}

export function dispatchClientUserProfileUpdated() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(USER_PROFILE_UPDATED_EVENT))
}
