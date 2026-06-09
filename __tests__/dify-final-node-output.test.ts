import { readFileSync } from "fs"
import path from "path"

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), "utf8")

describe("Dify final node output fallback", () => {
  it("falls back to final chatflow node outputs when Dify emits no message chunks", () => {
    const route = read("app/api/dify-chat/route.ts")

    expect(route).toContain("function extractFinalNodeOutputText")
    expect(route).toContain('nodeTitle.includes("总编辑")')
    expect(route).toContain('nodeTitle.includes("报告")')
    expect(route).toContain("let finalNodeOutputText = \"\"")
    expect(route).toContain("!hasReceivedContent && finalNodeOutputText.trim()")
    expect(route).toContain("已收到结果，正在整理")
  })

  it("keeps regular Dify streams alive while waiting for long chatflow nodes", () => {
    const route = read("app/api/dify-chat/route.ts")

    expect(route).toContain('dify-keepalive')
    expect(route).toContain("function enqueueSseStatus")
    expect(route).toContain('event: "status"')
    expect(route).toContain("连接正常，任务仍在处理中")
    expect(route).toContain("sanitizePublicAiStatus(payload.stage")
    expect(route).toContain('stage: "任务已提交"')
    expect(route).toContain('stage: "正在分析内容"')
    expect(route).not.toContain('stage: isWorkflow ? "工作流已提交" : "Dify 会话已提交"')
    expect(route).not.toContain("stage: nodeTitle")
    expect(route).not.toContain('if (model !== "open-claw" && !isAllInOneAgent) return body')
  })
})
