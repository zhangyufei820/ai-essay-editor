import { isAssistantFailureContent } from "@/lib/chat-message-guards"
import {
  getSafeUpstreamErrorMessage,
  hasInternalAiDetailText,
  hasTechnicalUpstreamErrorText,
  sanitizePublicAiError,
  sanitizePublicAiStatus,
  sanitizeAssistantMessageForPublicDisplay,
} from "@/lib/chat-error-sanitizer"
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

    expect(sanitized).toContain("### 当前回复未完整送达")
    expect(sanitized).toContain("任务已提交")
    expect(sanitized).not.toMatch(/Dify|工作流|节点|模型|供应商|网关|上游|备用线路/)
    expect(messageBubble).toContain("const publicContent = useMemo")
    expect(messageBubble).toContain("navigator.clipboard.writeText(publicContent)")
    expect(messageBubble).toContain("exportChatContentToPDF(publicContent")
    expect(messageBubble).toContain("text: publicContent")
    expect(enhancedChat).toContain("sanitizeAssistantMessageForPublicDisplay(sanitizeDifyAnswerForModel")
    expect(chatSession).toContain("toPublicChatMessage")
    expect(chatSession).toContain("sanitizeAssistantMessageForPublicDisplay(message.content)")
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
    expect(uploadRoute).toContain("文件上传服务暂时不可用，请稍后重试。")
    expect(uploadRoute).toContain('code: sanitizePublicAiErrorCode("DIFY_UPLOAD_CREDENTIAL_MISSING")')
    expect(uploadRoute).not.toMatch(/error:\s*`[^`]*(API Key 未配置|Dify API Key|DIFY_[A-Z_]+_API_KEY)/)
    expect(enhancedChat).toContain("hasInternalAiDetailText")
    expect(enhancedChat).toContain("getSafeAssistantErrorContent(message)")
    expect(enhancedChat).not.toContain("OpenClaw 上游模型响应超时")
    expect(enhancedChat).not.toContain("### 响应没有完整送达")
    expect(toolsPage).not.toMatch(/等待工作流返回|提交到工作流|网关连通性测试|OmniVoice 网关|图像上游|生成任务已提交，正在等待模型返回结果/)
    expect(`${openClawPicker}\n${codexPicker}`).not.toMatch(/OpenClaw Skills|Codex Skills|英文技能标识|传递给 OpenClaw|传递给超级全能智能体/)
    expect(openClawSkills).not.toMatch(/description:\s*"[^"]*(OpenClaw|节点|工作流)|tags:\s*\[[^\]]*"(OpenClaw|节点|工作流)"|name:\s*"[^"]*(节点|工作流)/)
  })
})
