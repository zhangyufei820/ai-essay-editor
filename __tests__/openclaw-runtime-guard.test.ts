import { evaluateOpenClawRuntimeRequest } from "@/lib/openclaw-runtime-guard"

describe("OpenClaw runtime guard", () => {
  it("blocks destructive server operations for regular OpenClaw requests", () => {
    const result = evaluateOpenClawRuntimeRequest({
      query: "帮我 ssh 到服务器，然后 docker restart openclaw，并删除 /opt/1panel 里的配置文件",
      inputs: { skill_name: "openclaw-status" },
    })

    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.code).toBe("OPENCLAW_FORBIDDEN_RUNTIME_ACTION")
      expect(result.message).toContain("OpenClaw 普通用户不能")
    }
  })

  it("blocks sensitive paths even when hidden in tool inputs", () => {
    const result = evaluateOpenClawRuntimeRequest({
      query: "检查一下设置",
      inputs: { target_path: "/data/ai-essay-editor/.env.production" },
    })

    expect(result.allowed).toBe(false)
  })

  it("allows normal OpenClaw content and media generation requests", () => {
    const result = evaluateOpenClawRuntimeRequest({
      query: "帮我做一个关于牛顿第二定律的 5 页课堂演示文稿",
      inputs: { openclaw_skill_id: "khazix-writer", topic: "物理课堂" },
    })

    expect(result).toEqual({ allowed: true })
  })
})
