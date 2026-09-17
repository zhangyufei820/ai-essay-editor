import { readFileSync } from "fs"
import path from "path"

const route = readFileSync(
  path.join(process.cwd(), "app/api/dify-chat/route.ts"),
  "utf8",
)

describe("Dify image essay fallback wiring", () => {
  it("uses only verified attachment OCR and one shared fallback runner", () => {
    expect(route).toContain("getVerifiedEssayOcrTextFromAttachments({")
    expect(route).toContain("userId,")
    expect(route).toContain("fileIds: difyFileIds")
    expect(route).toContain("fileAttachments,")
    expect(route).toContain("createEssayGradeFallbackRunner({")
    expect(route).toContain("const fallbackResultPromise = essayFallbackRunner.attempt(reason)")
  })

  it.each([
    'tryEssayGradeFallback("blocking_terminal_failure", controller)',
    'tryEssayGradeFallback("invalid_or_empty_dify_report", controller)',
    'tryEssayGradeFallback(`dify_stream_${reason}_timeout`, controller)',
    'tryEssayGradeFallback(`dify_${json.event || "terminal"}_failure`, controller)',
    'tryEssayGradeFallback("visual_node_failure", controller)',
    'tryEssayGradeFallback("empty_dify_response_body")',
    'createEarlyEssayFallbackResponse("dify_pre_response_timeout")',
    'createEarlyEssayFallbackResponse(`dify_http_${response.status}`)',
    'createEarlyEssayFallbackResponse("dify_no_response")',
  ])("attempts the fallback before a terminal exit: %s", (callSite) => {
    expect(route).toContain(callSite)
  })

  it("limits HTTP fallback to recoverable upstream failures", () => {
    expect(route).toContain("shouldAttemptEssayFallbackForHttpStatus(response.status)")
    expect(route).toContain("error instanceof DifyPreResponseTimeoutError")
  })

  it("cancels fallback work and refuses finalization after the client disconnects", () => {
    expect(route).toContain("essayFallbackAbortController.abort()")
    expect(route).toContain("if (taskCompleted || clientAborted) return")
    expect(route).toContain("if (result && !clientAborted)")
  })

  it("emits the recovered report once and records a zero-credit success", () => {
    expect(route).toContain("!essayDisplaySent")
    expect(route).toContain("essayDisplaySent = true")
    expect(route).toContain("essayFallbackUsed && !finalFailed && !essayFallbackTerminalSent")
    expect(route).toContain('event: "message_end"')
    expect(route).toContain("essay_fallback_used: true")
    expect(route).toContain("essayFallbackTerminalSent = true")
    expect(route).toContain("const shouldCharge = !essayFallbackUsed")
    expect(route).toContain("essay_fallback_used: essayFallbackUsed")
    expect(route).toContain("charged_credits: essayFallbackUsed ? 0 : undefined")
    expect(route).toContain('status: finalFailed ? "failed" : "succeeded"')
  })

  it("keeps vocab-card partial success handling independent", () => {
    expect(route).toContain('if (model === "vocab-card")')
    expect(route).toContain("canRecoverPartialEssayCorrection(")
    expect(route).toContain("shouldBufferEssayCorrection && canRecoverPartialEssayCorrection")
  })
})
