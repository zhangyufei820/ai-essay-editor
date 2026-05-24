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
    expect(route).toContain("已收到最终节点回复")
  })

  it("keeps regular Dify streams alive while waiting for long chatflow nodes", () => {
    const route = read("app/api/dify-chat/route.ts")

    expect(route).toContain('dify-keepalive')
    expect(route).not.toContain('if (model !== "open-claw" && !isAllInOneAgent) return body')
  })
})
