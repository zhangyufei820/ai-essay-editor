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
    expect(page).toContain('fetch("/api/image-prompt/reverse"')
    expect(page).toContain('fetch("/api/dify-chat"')
    expect(page).toContain('fetch("/api/omnivoice/voices"')
    expect(page).toContain('fetch("/api/omnivoice/tts"')
    expect(page).toContain("/api/omnivoice/jobs/")
    expect(page).toContain("TTS_POLL_MAX_ATTEMPTS = 150")
    expect(page).toContain("语音模型首次加载可能需要几分钟")
    expect(page).toContain("图像提示词反推")
    expect(page).toContain("gpt-image-2")
    expect(page).toContain("nano_banana")
    expect(page).toContain("isHtmlErrorContent")
    expect(page).toContain("图片服务暂时不可用，请稍后重试。")
    expect(page).not.toContain("映射 Image 2 网关")
    expect(page).not.toContain("映射 Banana/Gemini 图像工作流")
    expect(page).toContain("请先上传图片")
    expect(page).toContain("生成图像")
    expect(page).toContain('capture="environment"')
    expect(page).toContain("上传图片")
    expect(page).toContain("拍照识别")
    expect(page).toContain("文字转语音")
    expect(page).toContain("音色")
  })

  it("maps text-to-speech through the OmniVoice server gateway", () => {
    const client = read("lib/omnivoice-gateway-client.ts")
    const voicesRoute = read("app/api/omnivoice/voices/route.ts")
    const ttsRoute = read("app/api/omnivoice/tts/route.ts")
    const jobRoute = read("app/api/omnivoice/jobs/[jobId]/route.ts")

    expect(client).toContain("OMNIVOICE_GATEWAY_URL")
    expect(client).toContain("OMNIVOICE_GATEWAY_API_KEY")
    expect(client).toContain("/v1/voices")
    expect(client).toContain("/v1/tts")
    expect(client).toContain("/v1/jobs/")
    expect(client).toContain("/api/omnivoice/media")
    expect(client).toContain("fetchOmniMedia")
    expect(read("app/api/omnivoice/media/[filename]/route.ts")).toContain("fetchOmniMedia")
    expect(voicesRoute).toContain("listOmniVoices")
    expect(ttsRoute).toContain("createOmniTtsJob")
    expect(jobRoute).toContain("getOmniTtsJob")
  })

  it("keeps image prompt reverse server-side and maps both target model parameters", () => {
    const route = read("app/api/image-prompt/reverse/route.ts")
    const envExample = read(".env.example")

    expect(route).toContain("requireUser(request)")
    expect(route).toContain("DIFY_IMAGE_PROMPT_REVERSE_API_KEY")
    expect(route).toContain("/files/upload")
    expect(route).toContain("runDifyWorkflow")
    expect(route).toContain("consumeWithTrialCredits")
    expect(route).toContain("parseDifyUsage")
    expect(route).toContain("calculateTextCredits")
    expect(route).toContain("isHtmlErrorContent")
    expect(route).toContain('"gpt-image-2"')
    expect(route).toContain("nano_banana")
    expect(route).toContain("target_model")
    expect(envExample).toContain("DIFY_IMAGE_PROMPT_REVERSE_API_KEY=your_image_prompt_reverse_workflow_key_here")
    expect(`${route}\n${envExample}`).not.toContain("app-fag5U8NDhoD3BmtL814bDuQE")
  })

  it("does not expose upstream HTML error pages in image tool surfaces", () => {
    const toolPage = read("app/tools/page.tsx")
    const imageWorkspace = read("components/chat/gpt-image2-chat-interface.tsx")
    const chatRoute = read("app/api/dify-chat/route.ts")

    expect(toolPage).toContain("isHtmlErrorContent")
    expect(imageWorkspace).toContain("isHtmlErrorContent")
    expect(chatRoute).toContain("sanitizeUpstreamErrorText")
    expect(chatRoute).not.toContain("Dify Error: ${errorText}")
  })
})
