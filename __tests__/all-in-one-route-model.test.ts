import { readFileSync } from "fs"
import path from "path"

const source = () => readFileSync(path.join(process.cwd(), "components/chat/enhanced-chat-interface.tsx"), "utf8")
const routeSource = () => readFileSync(path.join(process.cwd(), "app/api/dify-chat/route.ts"), "utf8")

describe("all-in-one route model sync", () => {
  it("keeps all-in-one-agent as the selected model for dedicated routes", () => {
    const text = source()

    // 2026-05-16 sprint 6 之后实现已变化，断言收紧到语义层。
    expect(text).toMatch(/["']all-in-one-agent["']\s*:/)
    expect(text).toContain("all-in-one-agent")
    expect(text).toMatch(/const\s+lastUsedModelRef\s*=\s*useRef<ModelType>\(\(effectiveAgent as ModelType\)\s*\|\|\s*["']general-chat["']\)/)
    expect(text).toContain("lastUsedModelRef.current = targetModel")
    expect(text).toContain("lastUsedModelRef.current = initialModel")
  })

  it("does not restore general-chat over an explicit route model", () => {
    const text = source()

    expect(text).toContain("if (initialModel || urlAgent) return")
    expect(text).toContain("setSelectedModel(lastUsedModelRef.current)")
  })

  it("uses Workflow only for true Dify workflow apps", () => {
    const text = routeSource()

    expect(text).toMatch(/const\s+WORKFLOW_MODELS\s*=\s*new Set\(\[[^\]]*"vocab-card"[^\]]*\]\)/)
    expect(text).toContain('const ALL_IN_ONE_AGENT_MODEL = "all-in-one-agent"')
    expect(text).toContain('const SUPER_ALL_IN_ONE_AGENT_MODEL = "super-all-in-one-agent"')
    expect(text).not.toMatch(/const\s+WORKFLOW_MODELS\s*=\s*new Set\(\[[^\]]*["']all-in-one-agent["'][^\]]*\]\)/)
    expect(text).not.toMatch(/const\s+WORKFLOW_MODELS\s*=\s*new Set\(\[[^\]]*["']super-all-in-one-agent["'][^\]]*\]\)/)
    expect(text).not.toMatch(/const\s+WORKFLOW_MODELS\s*=\s*new Set\(\[[^\]]*["']gemini-image["'][^\]]*\]\)/)
    expect(text).toContain("buildAllInOneAgentWorkflowInputs(")
    expect(text).toContain("allInOneQuery")
    expect(text).toContain("normalizedCodexSkill ? normalizedCodexSkill.inputs : inputs")
    expect(text).not.toContain('"banana-2-pro", "gemini-image", "vocab-card"')
    expect(text).not.toContain('"banana-2-pro", "vocab-card", "all-in-one-agent"')
  })

  it("routes Gemini image through its gateway instead of Dify workflow", () => {
    const text = routeSource()

    expect(text).toContain('model === "gemini-image"')
    expect(text).toContain("callGeminiImageGatewayDirect(effectiveQuery, inputs)")
    expect(text).toContain("GEMINI_IMAGE_GATEWAY_URL")
    expect(text).toContain("gemini-image-gateway")
    expect(text).not.toContain('WORKFLOW_MODELS = new Set(["gemini-image"')
  })

  it("registers super all-in-one without hardcoding its app key", () => {
    const route = routeSource()
    const ui = source()

    expect(route).toContain("super-all-in-one-agent")
    expect(ui).toContain("超级全能智能体")
    expect(ui).toContain("const SUPER_ALL_IN_ONE_AGENT_PROMPTS")
    expect(ui).toContain("我想制定一个学习计划")
    expect(ui).toContain("selectedModel === \"super-all-in-one-agent\" ? SUPER_ALL_IN_ONE_AGENT_PROMPTS : ALL_IN_ONE_AGENT_PROMPTS")
    expect(`${route}\n${ui}`).not.toContain("app-W04iqTx08kQQstH9fcpSBqbN")
  })

  it("streams readable all-in-one answers while filtering setup events", () => {
    const text = routeSource()

    expect(text).toContain("function shouldStreamAllInOneAnswer")
    expect(text).toContain('!selector.includes("quick_reply_answer_node")')
    expect(text).toContain('!selector.includes("frontend_input_node")')
    expect(text).toContain("allInOneStreamedAnswer = true")
    expect(text).toContain("enqueueSseAnswer(controller, json.answer)")
    expect(text).toContain("!allInOneStreamedAnswer")
  })

  it("keeps chat apps streaming by default and only wraps JSON/blocking fallbacks as SSE", () => {
    const text = routeSource()

    expect(text).toContain("const useBlockingDifyChat")
    expect(text).toContain('process.env.DIFY_CHAT_FORCE_BLOCKING_MODE === "true"')
    expect(text).toContain('model !== "banana-2-pro"')
    expect(text).toContain('response_mode: useBlockingDifyChat ? "blocking" : isGptImage2 ? "blocking" : "streaming"')
    expect(text).toContain("applyBlockingDifyPayload")
    expect(text).toContain("shouldWrapDifyResponseAsSse")
    expect(text).toContain('"json_fallback"')
    expect(text).toContain('"X-Dify-Response-Mode": actualDifyResponseMode')
    expect(text).toContain("enqueueSseAnswer(controller, answer)")
  })
})
