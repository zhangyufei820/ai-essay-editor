const DEFAULT_PUBLIC_APP_URL = "https://www.shenxiang.school"

export function getPublicAppUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL

  try {
    const url = new URL(configuredUrl)
    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.origin
    }
  } catch {}

  return DEFAULT_PUBLIC_APP_URL
}
