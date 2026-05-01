import fs from "fs"
import path from "path"

const rootDir = path.resolve(__dirname, "..")

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8")
}

describe("Sprint 7 SEO metadata guardrails", () => {
  test("root metadata uses essay-correction positioning instead of old agent-plaza copy", () => {
    const source = readProjectFile("app/layout.tsx")

    expect(source).toContain('const SITE_TITLE = "沈翔智学｜AI作文批改 · 写作提分工具"')
    expect(source).toContain("上传作文，AI逐段批改、指出问题、给出提分建议")
    expect(source).toContain("写作提分")
    expect(source).toContain("const SITE_KEYWORDS = \"AI作文批改,作文批改,写作提分")

    expect(source).toContain("title: SITE_TITLE")
    expect(source).toContain("description: SITE_DESCRIPTION")
    expect(source).toContain("keywords: SITE_KEYWORDS")
    expect(source).toContain("description: SITE_DESCRIPTION")

    expect(source).not.toContain("智能体广场")
    expect(source).not.toContain("专业的AI作文批改专家，融合文学大师风格")
  })
})
