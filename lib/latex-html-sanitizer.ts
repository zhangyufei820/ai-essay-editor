import DOMPurify from "isomorphic-dompurify"

export function sanitizeLatexHtml(html: string) {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
  })
}
