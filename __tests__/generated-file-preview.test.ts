import {
  getGeneratedFilePreviewKind,
  getGeneratedFilePreviewUrl,
  rewriteGeneratedFileReferences,
  shouldPreviewGeneratedFileLink,
} from "@/lib/generated-file-preview"

describe("generated file previews", () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.shenxiang.school"
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
  })

  it("rewrites Codex task file URLs to the main-site preview proxy", () => {
    expect(
      rewriteGeneratedFileReferences("结果：/tasks/task_abc123/files/deck/final.pptx"),
    ).toContain("https://www.shenxiang.school/api/codex-skill-files/task_abc123/deck/final.pptx")
  })

  it("preserves Codex file capability tokens while rewriting URLs", () => {
    const token = "abcdefghijklmnopqrstuvwxyz_ABCDEFG-1234567890"
    expect(
      rewriteGeneratedFileReferences(`/tasks/task_abc123/files/deck/final.pptx?token=${token}`),
    ).toBe(`https://www.shenxiang.school/api/codex-skill-files/task_abc123/deck/final.pptx?token=${token}`)
  })

  it("prefers same-name HTML previews for presentation files", () => {
    expect(getGeneratedFilePreviewUrl("https://www.shenxiang.school/slides/final.pptx")).toBe(
      "https://www.shenxiang.school/slides/final.html",
    )
    expect(getGeneratedFilePreviewKind("/tasks/task_abc123/files/final.html")).toBe("presentation")
  })

  it("treats generated documents as previewable links", () => {
    expect(shouldPreviewGeneratedFileLink("/tasks/task_abc123/files/report.pdf", "报告")).toBe(true)
    expect(shouldPreviewGeneratedFileLink("/tasks/task_abc123/files/final.pptx", "打开预览")).toBe(true)
    expect(shouldPreviewGeneratedFileLink("https://example.com/page", "普通链接")).toBe(false)
  })
})
