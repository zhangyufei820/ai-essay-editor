import { readFileSync } from "fs"
import path from "path"
import { splitThinkingContent } from "@/lib/think-content"

const root = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8")

describe("chat think rendering and composer layout", () => {
  it("separates thinking tags from the formal answer", () => {
    const parsed = splitThinkingContent("<think>先判断用户意图</think>\n正式回答")

    expect(parsed.thinking).toBe("先判断用户意图")
    expect(parsed.answer).toBe("正式回答")
    expect(parsed.hasThinking).toBe(true)
  })

  it("keeps an unfinished thinking stream out of the formal answer", () => {
    const parsed = splitThinkingContent("<think>还在思考")

    expect(parsed.thinking).toBe("还在思考")
    expect(parsed.answer).toBe("")
    expect(parsed.hasOpenThinking).toBe(true)
  })

  it("anchors the chat composer to the bottom on desktop and mobile", () => {
    const source = read("components/chat/enhanced-chat-interface.tsx")

    expect(source).toContain("className=\"h-full overflow-y-auto custom-scrollbar pb-40 md:pb-44\"")
    expect(source).toContain("absolute inset-x-0 bottom-0 z-30")
    expect(source).not.toContain("md:relative md:p-6")
  })

  it("exposes camera capture and text-to-speech controls in chat composers", () => {
    const chatInput = read("components/chat/ChatInput.tsx")
    const composerV2 = read("components/chat/v2/ChatComposerV2.tsx")
    const workspaceV2 = read("components/chat/v2/ChatWorkspaceV2.tsx")
    const imageWorkspace = read("components/chat/gpt-image2-chat-interface.tsx")

    expect(chatInput).toContain('capture="environment"')
    expect(chatInput).toContain('aria-label="拍照上传"')
    expect(chatInput).toContain("朗读输入文字")
    expect(chatInput).toContain("getDifyTTS")
    expect(composerV2).toContain("onCamera")
    expect(composerV2).toContain('aria-label="拍照上传"')
    expect(workspaceV2).toContain("onCamera={onCamera ?? onAttach}")
    expect(imageWorkspace).toContain('capture="environment"')
  })

  it("lets OpenClaw load a skill and sends the English skill id through inputs", () => {
    const chatInput = read("components/chat/ChatInput.tsx")
    const picker = read("components/chat/OpenClawSkillPicker.tsx")
    const skills = read("lib/openclaw-skills.ts")
    const chatInterface = read("components/chat/enhanced-chat-interface.tsx")
    const route = read("app/api/dify-chat/route.ts")

    expect(chatInput).toContain("showOpenClawSkillButton")
    expect(chatInput).toContain("加载技能")
    expect(picker).toContain("选择一个技能后，会把对应英文技能标识传递给 OpenClaw")
    expect(skills).toContain('id: "khazix-writer"')
    expect(skills).toContain('id: "AI Video Generation"')
    expect(chatInterface).toContain('showOpenClawSkillButton={selectedModel === "open-claw"}')
    expect(chatInterface).toContain("openclaw_skill_id: selectedOpenClawSkill.id")
    expect(chatInterface).toContain("selected_skill: selectedOpenClawSkill.id")
    expect(chatInterface).toContain("skill_name: selectedOpenClawSkill.id")
    expect(route).toContain("getOpenClawSkillById")
    expect(route).toContain("openclaw_skill_description")
    expect(route).toContain("[OpenClaw 已加载技能]")
    expect(route).toContain("queryInjected")
  })

  it("guards OpenClaw server operations while allowing configured admins", () => {
    const route = read("app/api/dify-chat/route.ts")
    const guard = read("lib/openclaw-runtime-guard.ts")

    expect(route).toContain("evaluateOpenClawRuntimeRequest")
    expect(route).toContain('model === "open-claw" && !isConfiguredAdminUser(userId)')
    expect(route).toContain("code: guard.code")
    expect(guard).toContain("OPENCLAW_FORBIDDEN_RUNTIME_ACTION")
  })

  it("lets Codex load a skill in super all-in-one and sends the English skill id through inputs", () => {
    const chatInput = read("components/chat/ChatInput.tsx")
    const picker = read("components/chat/CodexSkillPicker.tsx")
    const skills = read("lib/codex-skills.ts")
    const chatInterface = read("components/chat/enhanced-chat-interface.tsx")
    const route = read("app/api/dify-chat/route.ts")

    expect(chatInput).toContain("showCodexSkillButton")
    expect(picker).toContain("选择一个技能后，会把对应英文技能标识传递给超级全能智能体")
    expect(skills).toContain('id: "paper_outline"')
    expect(skills).toContain('id: "shenxiang_image_gen"')
    expect(chatInterface).toContain('showCodexSkillButton={selectedModel === "super-all-in-one-agent"}')
    expect(chatInterface).toContain("codex_skill_id: selectedCodexSkill.id")
    expect(chatInterface).toContain("selected_skill: selectedCodexSkill.id")
    expect(chatInterface).toContain("skill_name: selectedCodexSkill.id")
    expect(route).toContain("getCodexSkillById")
    expect(route).toContain("codex_skill_description")
    expect(route).toContain("[Codex 已加载技能]")
    expect(route).toContain("buildCodexSkillQuery(effectiveQuery, normalizedCodexSkill.inputs)")
  })

  it("keeps chat auth extraction and empty workflow replies visible", () => {
    const source = read("components/chat/enhanced-chat-interface.tsx")

    expect(source).toContain("const uid = extractUserId(user)")
    expect(source).toContain("extractWorkflowOutputText(outputs)")
    expect(source).toContain("我没有收到可展示的作文批改结果")
  })

  it("keeps OpenClaw final node output visible when message chunks are empty", () => {
    const route = read("app/api/dify-chat/route.ts")

    expect(route).toContain("function extractOpenClawFinalNodeText")
    expect(route).toContain('nodeTitle.includes("直接回复")')
    expect(route).toContain('model === "open-claw" && json.event === "message_end"')
    expect(route).toContain("enqueueSseAnswer(controller, openClawFinalOutputText)")
  })

  it("blocks image uploads before login instead of failing after submission", () => {
    const imageWorkspace = read("components/chat/gpt-image2-chat-interface.tsx")

    expect(imageWorkspace).toContain("const isAuthenticated = Boolean(userId)")
    expect(imageWorkspace).toContain("请先登录后再上传图片。")
    expect(imageWorkspace).toContain("登录状态已过期，请重新登录后再上传或生成图片。")
    expect(imageWorkspace).toContain("disabled={!isAuthenticated || isSubmitting}")
  })
})
