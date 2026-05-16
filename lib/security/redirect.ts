export function safeInternalRedirectPath(value: string | null | undefined, fallback = "/") {
  if (!value) return fallback

  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {}

  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\") || decoded.includes("\u0000")) {
    return fallback
  }

  try {
    const parsed = new URL(decoded, "https://www.shenxiang.school")
    if (parsed.origin !== "https://www.shenxiang.school") return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}
