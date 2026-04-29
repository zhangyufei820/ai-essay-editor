const OPENCLAW_MEDIA_ROUTE = "/api/openclaw-media"

const OPENCLAW_MEDIA_URL_PATTERN =
  /https?:\/\/(?:43\.154\.111\.156|www\.shenxiang\.school|api\.shenxiang\.school|localhost|127\.0\.0\.1)(?::18789)?\/__openclaw__\/media\/([^\s)"'<>`]+)/g

const OPENCLAW_MEDIA_PATH_PATTERN =
  /\/home\/node\/\.openclaw\/media\/([^\s)"'<>`]+)/g

function publicBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://www.shenxiang.school").replace(/\/+$/, "")
}

function encodeMediaPath(value: string) {
  return value
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

export function toPublicOpenClawMediaUrl(mediaPath: string) {
  const encodedPath = encodeMediaPath(mediaPath)
  return `${publicBaseUrl()}${OPENCLAW_MEDIA_ROUTE}/${encodedPath}`
}

export function rewriteOpenClawMediaReferences(text: string) {
  return text
    .replace(OPENCLAW_MEDIA_URL_PATTERN, (_match, mediaPath: string) => toPublicOpenClawMediaUrl(mediaPath))
    .replace(OPENCLAW_MEDIA_PATH_PATTERN, (_match, mediaPath: string) => toPublicOpenClawMediaUrl(mediaPath))
}
