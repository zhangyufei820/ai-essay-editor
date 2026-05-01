import {
  createRequestId,
  extractArtifactsFromText,
  sanitizeForTrace,
} from "@/lib/ai-task-trace"

describe("ai task trace helpers", () => {
  it("creates prefixed request ids", () => {
    expect(createRequestId("openclaw")).toMatch(/^openclaw_/)
  })

  it("redacts secrets from nested payloads", () => {
    const sanitized = sanitizeForTrace({
      Authorization: "Bearer secret-token-value",
      message: "failed with Bearer secret-token-value",
      nested: { api_key: "secret-value" },
    }) as Record<string, unknown>

    expect(sanitized.Authorization).toBe("[redacted]")
    expect(String(sanitized.message)).toContain("[redacted]")
    expect((sanitized.nested as Record<string, unknown>).api_key).toBe("[redacted]")
  })

  it("extracts generated artifacts from OpenClaw and image output", () => {
    const artifacts = extractArtifactsFromText([
      "完成: https://www.shenxiang.school/slides/script-to-video-flow-v2.html",
      "图片: /api/openclaw-media-sign/tool-image-generation/result.png",
      "PDF: https://www.shenxiang.school/slides/report.pdf",
    ].join("\n"))

    expect(artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "html" }),
      expect.objectContaining({ type: "image" }),
      expect.objectContaining({ type: "pdf" }),
    ]))
  })
})
