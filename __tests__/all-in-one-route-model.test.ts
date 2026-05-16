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

  it("uses Chatflow instead of Workflow for all-in-one-agent", () => {
    const text = routeSource()

    expect(text).toMatch(/const\s+WORKFLOW_MODELS\s*=\s*new Set\(\[[^\]]*"banana-2-pro"[^\]]*"gemini-image"[^\]]*"vocab-card"[^\]]*\]\)/)
    expect(text).toContain('const ALL_IN_ONE_AGENT_MODEL = "all-in-one-agent"')
    expect(text).not.toMatch(/const\s+WORKFLOW_MODELS\s*=\s*new Set\(\[[^\]]*["']all-in-one-agent["'][^\]]*\]\)/)
    expect(text).toContain("buildAllInOneAgentWorkflowInputs(effectiveQuery, inputs, fileUrls)")
    expect(text).not.toContain('"banana-2-pro", "vocab-card", "all-in-one-agent"')
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
})
