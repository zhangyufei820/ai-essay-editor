import {
  getOpenClawAttachmentKind,
  isLikelyHtmlDocumentUrl,
  isLikelyRenderableImageUrl,
  rewriteOpenClawMediaReferences,
  toPublicOpenClawWorkspaceUrl,
} from "@/lib/openclaw-media"

describe("openclaw media rewriting", () => {
  const originalEnv = process.env.NEXT_PUBLIC_APP_URL

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.shenxiang.school"
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalEnv
  })

  it("rewrites OpenClaw gateway media URLs to the site proxy", () => {
    expect(
      rewriteOpenClawMediaReferences(
        "http://43.154.111.156:18789/__openclaw__/media/mermaid-diagram.png",
      ),
    ).toBe("https://www.shenxiang.school/api/openclaw-media-sign/mermaid-diagram.png")
  })

  it("rewrites OpenClaw gateway media URLs from the naked domain to the site proxy", () => {
    expect(
      rewriteOpenClawMediaReferences(
        "https://shenxiang.school/__openclaw__/media/tool-image-generation/image-2.png",
      ),
    ).toBe("https://www.shenxiang.school/api/openclaw-media-sign/tool-image-generation/image-2.png")
  })

  it("rewrites OpenClaw local media paths to the site proxy", () => {
    expect(
      rewriteOpenClawMediaReferences(
        "/home/node/.openclaw/media/tool-image-generation/image-1.png",
      ),
    ).toBe("https://www.shenxiang.school/api/openclaw-media-sign/tool-image-generation/image-1.png")
  })

  it("rewrites OpenClaw workspace slide paths to the public slides route", () => {
    expect(
      rewriteOpenClawMediaReferences(
        "/home/node/.openclaw/workspace/slides/cute-puppy.html",
      ),
    ).toBe("https://www.shenxiang.school/slides/cute-puppy.html")
  })

  it("rewrites OpenClaw workspace assets outside the slides folder to the public slides route", () => {
    expect(toPublicOpenClawWorkspaceUrl("essay-writing-guide-30p.html")).toBe(
      "https://www.shenxiang.school/slides/essay-writing-guide-30p.html",
    )
  })

  it("does not classify HTML slide pages as renderable images", () => {
    expect(isLikelyRenderableImageUrl("https://www.shenxiang.school/slides/cute-puppy.html")).toBe(false)
    expect(isLikelyHtmlDocumentUrl("https://www.shenxiang.school/slides/cute-puppy.html")).toBe(true)
    expect(getOpenClawAttachmentKind("https://www.shenxiang.school/slides/cute-puppy.html")).toBe("file")
  })

  it("classifies real image assets as renderable images", () => {
    expect(isLikelyRenderableImageUrl("https://www.shenxiang.school/slides/bg1.png")).toBe(true)
    expect(getOpenClawAttachmentKind("https://www.shenxiang.school/api/openclaw-media-sign/output.webp")).toBe("image")
  })
})
