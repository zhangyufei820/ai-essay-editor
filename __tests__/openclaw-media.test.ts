import { rewriteOpenClawMediaReferences } from "@/lib/openclaw-media"

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
    ).toBe("https://www.shenxiang.school/api/openclaw-media/mermaid-diagram.png")
  })

  it("rewrites OpenClaw local media paths to the site proxy", () => {
    expect(
      rewriteOpenClawMediaReferences(
        "/home/node/.openclaw/media/tool-image-generation/image-1.png",
      ),
    ).toBe("https://www.shenxiang.school/api/openclaw-media/tool-image-generation/image-1.png")
  })
})
