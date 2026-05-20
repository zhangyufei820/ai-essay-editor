import fs from "fs"
import path from "path"

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8")

describe("tools workbench route mappings", () => {
  it("routes OCR and document extraction through essay-ai-suite instead of provider-specific mocks", () => {
    const ocr = read("app/api/ocr/route.ts")
    const doc = read("app/api/document-process/route.ts")
    const client = read("lib/essay-ai-suite-client.ts")

    expect(ocr).toContain('"/api/ocr/image"')
    expect(ocr).toContain('"/api/ocr/batch"')
    expect(ocr).toContain("callEssayAiSuite")
    expect(ocr).not.toContain("VIVA_API_KEY")
    expect(ocr).not.toContain("www.vivaapi.cn")

    expect(doc).toContain('"/api/doc/extract"')
    expect(doc).toContain("callEssayAiSuite")
    expect(doc).not.toContain("从PDF提取的文本内容")
    expect(doc).not.toContain("从Word文档提取的文本内容")

    expect(client).toContain("ESSAY_AI_SUITE_URL")
    expect(client).toContain("ESSAY_AI_SUITE_API_TOKEN")
  })

  it("does not ship fake web-search or presentation success payloads", () => {
    const search = read("app/api/web-search/route.ts")
    const presentation = read("app/api/presentation/route.ts")

    expect(search).not.toContain("https://example.com")
    expect(search).toContain("TAVILY_API_KEY")
    expect(search).toContain("DIFY_WEB_SEARCH_API_KEY")
    expect(search).toContain("WEB_SEARCH_NOT_CONFIGURED")

    expect(presentation).not.toContain("presentation-id")
    expect(presentation).not.toContain("https://docs.google.com/presentation/d/...")
    expect(presentation).toContain("markdown-outline")
    expect(presentation).toContain("DIFY_PRESENTATION_API_KEY")
  })

  it("keeps all browser tool entries mapped to local API routes", () => {
    const page = read("app/tools/page.tsx")

    expect(page).toContain('fetch("/api/document-process"')
    expect(page).toContain('fetch("/api/ocr"')
    expect(page).toContain('fetch("/api/presentation"')
    expect(page).toContain('fetch("/api/web-search"')
    expect(page).toContain('fetch("/api/sparkpage"')
    expect(page).toContain('capture="environment"')
    expect(page).toContain("上传图片")
    expect(page).toContain("拍照识别")
  })
})
