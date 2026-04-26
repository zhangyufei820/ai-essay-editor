export function extractUserId(user: unknown): string {
  if (!user || typeof user !== "object") return ""

  const value = user as Record<string, unknown>
  const directId = value.id || value.sub || value.userId || value.user_id
  if (typeof directId === "string" && directId.trim()) return directId

  const nestedUser = value.user
  if (nestedUser && typeof nestedUser === "object") {
    const nested = nestedUser as Record<string, unknown>
    const nestedId = nested.id || nested.sub || nested.userId || nested.user_id
    if (typeof nestedId === "string" && nestedId.trim()) return nestedId
  }

  const nestedData = value.data
  if (nestedData && typeof nestedData === "object") {
    const nested = nestedData as Record<string, unknown>
    const nestedId = nested.id || nested.sub || nested.userId || nested.user_id
    if (typeof nestedId === "string" && nestedId.trim()) return nestedId
  }

  return ""
}
