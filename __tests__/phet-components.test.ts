import { readFileSync } from "fs"
import path from "path"
import {
  buildPhetChatHref,
  buildPhetChatPrompt,
  getPhetSim,
} from "@/lib/phet/phet-utils"

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8")
}

describe("PhET UI integration", () => {
  it("renders iframe with lazy loading and sandbox restrictions", () => {
    const source = read("components/phet/PhetSimEmbed.tsx")

    expect(source).toContain('sandbox="allow-scripts allow-same-origin"')
    expect(source).toContain('loading="lazy"')
    expect(source).toContain("requestFullscreen")
    expect(source).toContain("PhetSimControls")
  })

  it("provides browser search and filter controls", () => {
    const source = read("components/phet/PhetSimBrowser.tsx")

    expect(source).toContain("搜索实验、知识点、年级内容")
    expect(source).toContain("全部学科")
    expect(source).toContain("全部年级")
    expect(source).toContain("全部难度")
    expect(source).toContain("最新使用")
  })

  it("creates lab pages and completion action", () => {
    expect(read("app/lab/page.tsx")).toContain("互动实验室")
    expect(read("app/lab/[simId]/page.tsx")).toContain("PhetSimEmbed")
    expect(read("components/phet/PhetCompleteButton.tsx")).toContain("/api/lab/record")
    expect(read("components/phet/PhetCompleteButton.tsx")).toContain("登录后可记录学习")
  })

  it("builds the three expected chat links for a simulation", () => {
    const sim = getPhetSim("forces-and-motion-basics")!

    expect(buildPhetChatHref(sim, "flashcards")).toMatch(/^\/chat\/vocab-card\?prompt=/)
    expect(buildPhetChatHref(sim, "quiz")).toMatch(/^\/chat\/quanquan-math\?prompt=/)
    expect(buildPhetChatHref(sim, "animation")).toMatch(/^\/chat\?agent=open-claw&prompt=/)
    expect(buildPhetChatPrompt(sim, "quiz")).toContain("力、摩擦力、牛顿定律、加速度")
  })

  it("allows PhET frames and thumbnails in Next config", () => {
    const source = read("next.config.mjs")

    expect(source).toContain("hostname: 'phet.colorado.edu'")
    expect(source).toContain("frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://phet.colorado.edu")
  })
})
