const mockSanitize = jest.fn((html: string) => html
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/\sonerror="[^"]*"/gi, ""))

jest.mock("isomorphic-dompurify", () => ({
  __esModule: true,
  default: { sanitize: (...args: unknown[]) => mockSanitize(...args as [string]) },
}))

import { sanitizeLatexHtml } from "@/lib/latex-html-sanitizer"
import { escapeLatexErrorHtml, renderLatexWithCorrection } from "@/lib/latex-utils"

describe("LaTeX HTML security", () => {
  it("removes active HTML before rendering KaTeX output", () => {
    const sanitized = sanitizeLatexHtml('<span class="katex">safe</span><img src=x onerror="alert(1)"><script>alert(1)</script>')

    expect(sanitized).toContain('class="katex"')
    expect(sanitized).not.toMatch(/onerror|<script/i)
    expect(mockSanitize).toHaveBeenCalledWith(expect.any(String), {
      USE_PROFILES: { html: true, mathMl: true, svg: true },
    })
  })

  it("escapes malicious formula text in error fallbacks", () => {
    const malicious = '<img src=x onerror="alert(1)">&formula'

    expect(escapeLatexErrorHtml(malicious)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;formula")
    expect(renderLatexWithCorrection(malicious, false)).not.toContain("<img")
  })
})
