import { isAssistantFailureContent } from "@/lib/chat-message-guards"
import {
  getSafeUpstreamErrorMessage,
  hasInternalAiDetailText,
  hasTechnicalUpstreamErrorText,
  sanitizePublicAiError,
  sanitizePublicAiErrorCode,
  sanitizePublicAiStatus,
  sanitizeAssistantMessageForPublicDisplay,
  stripUpstreamBranding,
} from "@/lib/chat-error-sanitizer"
import { sanitizePublicAiLabel } from "@/lib/public-ai-labels"
import { readFileSync } from "fs"
import path from "path"

const root = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8")

describe("chat message guards", () => {
  it("marks upstream failure messages as non-shareable assistant content", () => {
    expect(isAssistantFailureContent("### 响应没有完整送达\n\nOpenClaw 上游模型本次返回为空，请重新提交。")).toBe(true)
    expect(isAssistantFailureContent("OpenClaw 任务已结束，但没有返回可展示内容。")).toBe(true)
    expect(isAssistantFailureContent("PluginInvokeError: contents is required")).toBe(true)
    expect(isAssistantFailureContent("这是一份正常的教学评价报告。")).toBe(false)
  })

  it("hides technical upstream error details from the user-facing copy", () => {
    const technicalMessage = "req_id: 073a50cd02 PluginInvokeError: {'args':{'description':'[models] Error: API request failed with status code 408: {\"error\":{\"message\":\"LiteLLM.Timeout: APITimeoutError - Request timed out. Error_str: Request timed out... No fallback model group found for original_model_group=gemini-3.1-pro-preview\"}}'}}"

    expect(hasTechnicalUpstreamErrorText(technicalMessage)).toBe(true)
    expect(getSafeUpstreamErrorMessage(technicalMessage, "智能服务暂时不可用，请稍后重试。")).toBe("智能服务响应超时或连接中断。请先刷新当前会话或历史记录查看是否已有结果；若仍无结果，再重新提交。")
    expect(getSafeUpstreamErrorMessage("正常业务文案", "智能服务暂时不可用，请稍后重试。")).toBeNull()
  })

  it("removes backend provider and workflow details from public task status text", () => {
    const samples = [
      "Dify 会话已提交",
      "轮询 Dify 工作流详情",
      "总编辑 执行失败",
      "PluginInvokeError: [models] Error from LiteLLM provider TokenFlux",
      "node_finished model_provider=openai workflow_run_id=abc",
    ]

    for (const sample of samples) {
      const publicStatus = sanitizePublicAiStatus(sample, "任务仍在处理中")
      const publicError = sanitizePublicAiError(sample, "服务暂时不可用，请稍后重试。")
      expect(hasInternalAiDetailText(publicStatus)).toBe(false)
      expect(hasInternalAiDetailText(publicError)).toBe(false)
      expect(`${publicStatus}\n${publicError}`).not.toMatch(/Dify|Workflow|Plugin|LiteLLM|TokenFlux|node|model|provider|工作流|节点|模型|工具|插件|上游|网关|备用线路/)
    }

    expect(sanitizePublicAiStatus("Dify 会话已提交")).toBe("任务已提交")
  })

  it("removes supplier names, domains, request ids, and channel details from public errors", () => {
    const samples = [
      "Yunwu provider_error: No available channel for model gpt-5.5 channel_id=14 x-request-id=req_123",
      "云雾余额不足 cf-ray=abc123 https://yunwu.ai/v1/chat/completions",
      "Moonapix gateway failed request_id=moon_1 https://moonapix.com/v1/images/generations",
      "VivaAPI upstream response channel=3 api.gjx88.com returned provider_error",
      "Fable distributor error trace_id=trace_1",
      "RelayDance API failed with GJX fallback",
      "OmniVoice request failed at tokenflux.dev",
    ]

    for (const sample of samples) {
      const publicError = sanitizePublicAiError(sample, "服务暂时不可用，请稍后重试。")
      const publicStatus = sanitizePublicAiStatus(sample, "任务仍在处理中")
      expect(hasInternalAiDetailText(publicError)).toBe(false)
      expect(hasInternalAiDetailText(publicStatus)).toBe(false)
      expect(`${publicError}\n${publicStatus}`).not.toMatch(/Yunwu|云雾|Moonapix|VivaAPI|TokenFlux|Fable|GJX|RelayDance|OmniVoice|api\.gjx88|yunwu\.ai|moonapix\.com|tokenflux\.dev|No available channel|x-request-id|cf-ray|channel_id|trace_id|provider|gateway|upstream/i)
    }
  })

  it("keeps public OpenClaw artifact links while hiding upstream service URLs", () => {
    const answer = [
      "已生成，不需要重复生成同一个文件。直接打开这里：",
      "[点击查看演示文稿](https://www.shenxiang.school/slides/geometry-proof.html)",
      "备用文件：/api/openclaw-media-sign/output/preview.png",
    ].join("\n")
    const upstreamError = "Moonapix gateway failed https://moonapix.com/v1/images/generations request_id=req_1"

    expect(hasInternalAiDetailText(answer)).toBe(false)
    expect(sanitizeAssistantMessageForPublicDisplay(answer)).toBe(answer)
    expect(stripUpstreamBranding(answer)).toContain("https://www.shenxiang.school/slides/geometry-proof.html")
    expect(stripUpstreamBranding(answer)).toContain("/api/openclaw-media-sign/output/preview.png")
    expect(sanitizePublicAiError(upstreamError, "服务暂时不可用，请稍后重试。")).not.toMatch(/moonapix\.com|request_id|gateway/i)
  })

  it("maps image safety rejections to a precise public message and code", () => {
    const upstreamError = "Your request was rejected by the safety system. safety_violations=[sexual]. code=moderation_blocked"

    expect(getSafeUpstreamErrorMessage(upstreamError, "图片服务暂时不可用，请稍后重试。")).toBe("图片内容触发安全审核，请调整描述或素材后重试。")
    expect(sanitizePublicAiError(upstreamError, "图片服务暂时不可用，请稍后重试。")).toBe("图片内容触发安全审核，请调整描述或素材后重试。")
    expect(sanitizePublicAiErrorCode("moderation_blocked")).toBe("SERVICE_INPUT_REJECTED")
  })

  it("blocks backend model and provider labels from public labels", () => {
    const samples = [
      "GPT Image 2",
      "Image 2",
      "Banana2 Pro 4K",
      "Google Gemini 图像",
      "Claude Opus",
      "ChatGPT 5.5",
      "OpenClaw",
      "TokenFlux provider",
      "workflow node model group",
    ]

    for (const sample of samples) {
      expect(sanitizePublicAiLabel(sample, "智能任务")).toBe("智能任务")
      expect(hasInternalAiDetailText(sample)).toBe(true)
    }
  })

  it("sanitizes old assistant failure messages before rendering history, copy, audio, export, or sharing", () => {
    const oldContent = [
      "### 响应没有完整送达",
      "",
      "全学段数学 任务仍在处理中： Dify 会话已提交",
      "",
      "建议：先刷新当前会话或历史记录查看是否已有结果。",
    ].join("\n")
    const sanitized = sanitizeAssistantMessageForPublicDisplay(oldContent)
    const messageBubble = read("components/chat/MessageBubble.tsx")
    const enhancedChat = read("components/chat/enhanced-chat-interface.tsx")
    const chatSession = read("app/api/chat-session/route.ts")
    const saveMessage = read("app/api/save-message/route.ts")

    expect(sanitized).toContain("### 当前回复未完整送达")
    expect(sanitized).toContain("任务已提交")
    expect(sanitized).toBe([
      "### 当前回复未完整送达",
      "任务已提交，仍在处理中",
      "",
      "建议：先刷新当前会话或历史记录查看是否已有结果。",
    ].join("\n"))
    expect(sanitized).not.toMatch(/Dify|工作流|节点|模型|供应商|网关|上游|备用线路/)
    expect(messageBubble).toContain("const publicContent = useMemo")
    expect(messageBubble).toContain("navigator.clipboard.writeText(publicContent)")
    expect(messageBubble).toContain("exportChatContentToPDF(publicContent")
    expect(messageBubble).toContain("text: publicContent")
    expect(enhancedChat).toContain("sanitizeAssistantMessageForPublicDisplay(sanitizeDifyAnswerForModel")
    expect(chatSession).toContain("toPublicChatMessage")
    expect(chatSession).toContain("sanitizeAssistantMessageForPublicDisplay(message.content)")
    expect(saveMessage).toContain("sanitizeAssistantMessageForPublicDisplay(content)")
    expect(saveMessage).toContain("content: safeContent")
  })

  it("uses the guard before showing share rewards or creating share links", () => {
    const messageBubble = read("components/chat/MessageBubble.tsx")
    const enhancedChat = read("components/chat/enhanced-chat-interface.tsx")

    expect(messageBubble).toContain("isAssistantFailureContent")
    expect(messageBubble).toContain("!isFailureContent ? <ShareRewardCallout")
    expect(messageBubble).toContain("!isFailureContent ? (")
    expect(messageBubble).toContain("<MessageActionToolbar")
    expect(enhancedChat).toContain("isAssistantFailureContent(message.content)")
    expect(enhancedChat).toContain("不能分享到创作广场")
    expect(enhancedChat).toContain("normalizeChatTaskFailureMessage")
  })

  it("does not expose internal routing, workflow, or trace details through user-facing chat surfaces", () => {
    const route = read("app/api/dify-chat/route.ts")
    const taskStatus = read("app/api/task-status/route.ts")
    const trace = read("lib/ai-task-trace.ts")
    const enhancedChat = read("components/chat/enhanced-chat-interface.tsx")
    const imageWorkspace = read("components/chat/gpt-image2-chat-interface.tsx")
    const mediaTasks = read("app/api/media/tasks/route.ts")
    const relaydance = read("app/api/media/video/relaydance/route.ts")
    const uploadRoute = read("app/api/dify-upload/route.ts")
    const toolsPage = read("app/tools/page.tsx")
    const openClawPicker = read("components/chat/OpenClawSkillPicker.tsx")
    const codexPicker = read("components/chat/CodexSkillPicker.tsx")
    const openClawSkills = read("lib/openclaw-skills.ts")

    expect(taskStatus).toContain("tasks.map(toPublicTaskRun)")
    expect(taskStatus).toContain("tasks.map(normalizeMediaTask)")
    expect(trace).toContain("export function toPublicTaskRun")
    expect(trace).not.toContain("return {\n    ...task,")
    expect(route).toContain("后端解析 Dify 原始 SSE 后只重发用户端需要的安全事件")
    expect(route).not.toContain("controller.enqueue(chunk)")
    expect(route).not.toContain('"X-Trace-Id"')
    expect(route).not.toContain('"X-Dify-Response-Mode"')
    expect(enhancedChat).not.toContain("X-Trace-Id")
    expect(enhancedChat).not.toContain("task.current_tool")
    expect(enhancedChat).not.toContain("workflow_run_id:")
    expect(`${mediaTasks}\n${relaydance}`).not.toMatch(/trace_id: taskRun\.traceId|next_adapter/)
    expect(`${mediaTasks}\n${relaydance}`).not.toMatch(/NextResponse\.json\(\{[\s\S]{0,260}(provider_task_id|trace_id|next_adapter)/)
    expect(imageWorkspace).not.toContain("subtitle: \"Moonapix")
    expect(imageWorkspace).not.toContain("traceId?: string")
    expect(imageWorkspace).not.toContain("response.headers.get(\"X-Trace-Id\")")
    expect(imageWorkspace).not.toContain("FieldLabel>图像模型")
    expect(imageWorkspace).not.toContain("模型：{")
    expect(imageWorkspace).not.toContain("参数预览")
    expect(imageWorkspace).toContain("提交预览")
    expect(imageWorkspace).toContain("图像服务配置暂时不可用，请联系管理员处理。")
    expect(imageWorkspace).not.toContain("图像工作流凭据失效，请管理员更新 Dify 应用 API Key 后重试。")
    expect(route).toContain('code: sanitizePublicAiErrorCode("DIFY_CREDENTIAL_MISSING")')
    expect(route).toContain("code: sanitizePublicAiErrorCode(handledErrorCode)")
    expect(route).toContain("extractGatewayErrorMessage(")
    expect(route).toContain('await finalizeDifyChatResponse(controller, "流结束")')
    expect(route).toContain("hasReceivedContent = true")
    expect(uploadRoute).toContain("文件上传服务暂时不可用，请稍后重试。")
    expect(uploadRoute).toContain('code: sanitizePublicAiErrorCode("DIFY_UPLOAD_CREDENTIAL_MISSING")')
    expect(uploadRoute).not.toMatch(/error:\s*`[^`]*(API Key 未配置|Dify API Key|DIFY_[A-Z_]+_API_KEY)/)
    expect(enhancedChat).toContain("hasInternalAiDetailText")
    expect(enhancedChat).toContain("getSafeAssistantErrorContent(message)")
    expect(enhancedChat).not.toContain("OpenClaw 上游模型响应超时")
    expect(enhancedChat).not.toContain("### 响应没有完整送达")
    expect(toolsPage).not.toMatch(/等待工作流返回|提交到工作流|网关连通性测试|OmniVoice 网关|图像上游|生成任务已提交，正在等待模型返回结果/)
    expect(`${openClawPicker}\n${codexPicker}`).not.toMatch(/OpenClaw Skills|Codex Skills|英文技能标识|传递给 OpenClaw|传递给超级全能智能体/)
    expect(`${openClawPicker}\n${codexPicker}`).not.toContain("英文 id")
    expect(`${openClawPicker}\n${codexPicker}`).not.toContain("<p className=\"mt-1 truncate font-[var(--font-mono-v2)] text-[11px] text-[var(--ink-400)]\">\n                                      {skill.id}")
    expect(openClawSkills).not.toMatch(/description:\s*"[^"]*(OpenClaw|节点|工作流)|tags:\s*\[[^\]]*"(OpenClaw|节点|工作流)"|name:\s*"[^"]*(节点|工作流)/)
  })

  it("shows OpenClaw presentations through HTML preview instead of a download-first PPT viewer", () => {
    const enhancedChat = read("components/chat/enhanced-chat-interface.tsx")
    const messageBubble = read("components/chat/MessageBubble.tsx")
    const enhancedMarkdown = read("components/chat/EnhancedMarkdown.tsx")
    const media = read("lib/openclaw-media.ts")

    expect(media).toContain("resolveOpenClawPresentationPreviewUrl")
    expect(enhancedChat).toContain("GeneratedFilePreview")
    expect(enhancedMarkdown).toContain("GeneratedFilePreview")
    expect(messageBubble).toContain("shouldPreviewPresentationLink")
    expect(messageBubble).toContain("<GeneratedFilePreview src={rawHref} title={label || \"演示文稿\"} />")
    expect(enhancedChat).not.toContain("docs.google.com/gview")
    expect(enhancedChat).not.toContain("PPT Preview")
    expect(enhancedMarkdown).not.toContain("download={label}")
    expect(enhancedMarkdown).not.toContain("withDownloadParam")
  })

  it("renders generated files as preview components instead of download-first links", () => {
    const preview = read("lib/generated-file-preview.ts")
    const component = read("components/chat/GeneratedFilePreview.tsx")
    const route = read("app/api/codex-skill-files/[taskId]/[...path]/route.ts")
    const enhancedMarkdown = read("components/chat/EnhancedMarkdown.tsx")
    const messageBubble = read("components/chat/MessageBubble.tsx")

    expect(preview).toContain("rewriteGeneratedFileReferences")
    expect(preview).toContain("/api/codex-skill-files/")
    expect(component).toContain("打开预览")
    expect(component).not.toContain("下载")
    expect(enhancedMarkdown).toContain("shouldPreviewGeneratedFileLink")
    expect(messageBubble).toContain("shouldPreviewGeneratedFileLink")
    expect(route).toContain('request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"')
    expect(route).toContain("Content-Disposition")
  })

  it("buffers and sanitizes OpenClaw streaming message text before exposing it to users", () => {
    const route = read("app/api/dify-chat/route.ts")

    expect(route).toContain("let pendingOpenClawAnswerRawText = \"\"")
    expect(route).toContain("const appendOpenClawAnswerChunk")
    expect(route).toContain("const emitOpenClawFallbackDisplay")
    expect(route).toContain("if (model === \"open-claw\") {")
    expect(route).toContain("appendOpenClawAnswerChunk(String(json.answer))")
    expect(route).toContain("continue")
    expect(route).toContain("if (model === \"open-claw\" && json.event === \"message_end\")")
    expect(route).toContain("openClawFinalOutputText,\n        pendingOpenClawAnswerRawText,\n        finalNodeOutputText")
    expect(route).toContain(".map((text) => cleanOpenClawAnswerForDisplay(text))")
    expect(route).toContain("hasUsefulOpenClawResult(text)")
    expect(route).toContain("rewriteOpenClawMediaReferencesWithSignedUrls(")
    expect(route).toContain("rawOutputText")
    expect(route).not.toContain("rewriteOpenClawMediaReferencesWithSignedUrls(String(json.answer), undefined, userId)")
  })

  it("uses public capability labels across user-facing app entry points", () => {
    const navigationModels = read("lib/navigation-models.ts")
    const agentPlaza = read("components/agents/agent-plaza-data.ts")
    const agentRegistry = read("components/chat/v2/agent-registry.ts")
    const modelPanel = read("components/chat/ModelPanel.tsx")
    const chatInput = read("components/chat/ChatInput.tsx")
    const notFound = read("app/not-found.tsx")
    const enhancedChat = read("components/chat/enhanced-chat-interface.tsx")
    const appSidebar = read("components/app-sidebar.tsx")
    const chatSidebar = read("components/chat/chat-sidebar.tsx")
    const emptyState = read("components/chat/EmptyState.tsx")
    const agentPanel = read("components/chat/AgentPanel.tsx")
    const openClawSection = read("components/home/OpenClawSection.tsx")
    const agentPlazaPage = read("components/agents/AgentPlazaPage.tsx")
    const historyPage = read("app/history/page.tsx")
    const toolsPage = read("app/tools/page.tsx")
    const chatLayout = read("app/chat/layout.tsx")
    const gptImagePage = read("app/chat/gpt-image-2/page.tsx")
    const imageWorkspace = read("components/chat/gpt-image2-chat-interface.tsx")
    const imageConfig = read("components/chat/image-generation/config.ts")
    const imageInputsConfig = read("components/chat/image-generation/gpt-image-v11.ts")
    const educationPanel = read("components/chat/EducationPanel.tsx")
    const pricingPage = read("components/pricing/v2/PricingPageV2.tsx")
    const pricing = read("components/pricing.tsx")
    const aboutPage = read("app/about/page.tsx")
    const htmlPreview = read("components/chat/OpenClawHtmlPreview.tsx")
    const runtimeGuard = read("lib/openclaw-runtime-guard.ts")
    const helpPage = read("components/help/HelpPageClient.tsx")
    const helpLayout = read("app/help/layout.tsx")
    const termsPage = read("app/terms/page.tsx")
    const providersRoute = read("app/api/providers/route.ts")
    const imagePromptOptimizer = read("app/api/image-prompt/optimize/route.ts")
    const sunoPage = read("components/suno/SunoPage.tsx")

    const publicSurface = [
      navigationModels,
      agentPlaza,
      agentRegistry,
      modelPanel,
      chatInput,
      notFound,
      appSidebar,
      chatSidebar,
      emptyState,
      agentPanel,
      openClawSection,
      agentPlazaPage,
      historyPage,
      toolsPage,
      chatLayout,
      gptImagePage,
      imageWorkspace,
      imageConfig,
      imageInputsConfig,
      educationPanel,
      pricingPage,
      pricing,
      aboutPage,
      htmlPreview,
      runtimeGuard,
      helpPage,
      helpLayout,
      termsPage,
      providersRoute,
      imagePromptOptimizer,
      sunoPage,
      enhancedChat.replace(/import[\s\S]*?const BRAND_GREEN/, "const BRAND_GREEN"),
    ].join("\n")

    const withoutCodeOnlyIdentifiers = publicSurface
      .replace(/import[\s\S]*?from\s+["'][^"']+["']/g, "")
      .replace(/type\s+\w*[A-Za-z]*(?:OpenClaw|Codex|Dify|Workflow|Gemini|Gpt|Suno)\w*[\s\S]*?(?=\n(?:type|interface|const|function|export|class)\b|$)/g, "")
      .replace(/\b(?:const|let|var|function)\s+\w*[A-Za-z]*(?:OpenClaw|Codex|Dify|Workflow|Gemini|Gpt|Suno|Banana)\w*[\s\S]*?(?=\n(?:const|let|var|function|export|class|type|interface)\b|$)/g, "")
      .replace(/\/(?:\\\/|[^/\n])+\/[a-z]*/gi, "")
      .replace(/\/\/.*$/gm, "")
    const publicCopySurface = [
      agentPlaza,
      agentRegistry,
      toolsPage,
      helpPage,
      helpLayout,
      pricing,
    ].join("\n")

    expect(withoutCodeOnlyIdentifiers).not.toMatch(/ChatGPT|Claude opus|Claude Opus|Gemini Pro|Gemini 图像|Google Gemini|Grok 4\.2|Grok-4\.2|Open Claw|OpenClaw 演示页|OpenClaw 智能助手|GPT Image 2|Image 2|Banana2 Pro|Banana 2 Pro|suno音乐创作|DeepSeek|Qwen|OpenAI|Anthropic|xAI|Fireworks|Llama|Mixtral|独立模型|顶级模型|高级模型|模型专区|模型版本|供应商|网关|工作流凭据失效|英文 id/)
    expect(publicCopySurface).not.toMatch(/按 Token 计费|1K tokens|token 用量|target_model 仅支持|参数映射|Tools Desk|Sparkpage 综合报告/)
    expect(publicSurface).toContain("getPublicAiLabel(\"gpt-5\")")
    expect(publicSurface).toContain("getPublicAiLabel(\"claude-opus\")")
    expect(publicSurface).toContain("getPublicAiLabel(\"gemini-pro\")")
    expect(publicSurface).toContain("getPublicAiLabel(\"open-claw\")")
    expect(publicSurface).toContain("getPublicAiLabel(\"gpt-image-2\")")
    expect(chatInput).not.toContain("加载 Codex 技能")
    expect(chatInput).not.toContain("选择 AI 模型")
    expect(notFound).not.toMatch(/GPT|Claude|Gemini/)
    expect(providersRoute).not.toMatch(/OpenAI|Anthropic|Claude|Gemini|Grok|Fireworks|Llama|Mixtral/)
    expect(imagePromptOptimizer).toContain('getPublicAiLabel(model, "图像创作")')
    expect(sunoPage).not.toContain("模型版本")
  })
})
