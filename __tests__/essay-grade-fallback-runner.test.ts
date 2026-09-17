jest.mock("server-only", () => ({}))

import { createEssayGradeFallbackRunner } from "@/lib/essay-grade-fallback-runner"

const validReport = [
  "# 作文批改报告",
  "综合总分：86/100分",
  "## 总评",
  "文章主题明确，内容完整，结构由开头、主体和结尾组成，叙事顺序清楚。",
  "## 优点",
  "语言自然，段落衔接顺畅，细节描写能够支撑中心。",
  "## 修改建议",
  "建议补充人物动作和环境描写，并对结尾进行润色，使主题更集中。",
].join("\n")

describe("essay grade fallback runner", () => {
  it("runs one validated fallback when several terminal signals race", async () => {
    let resolveGrade: ((value: {
      markdownReport: string
      provider: "llm"
      model: string
      promptVersion: string
    }) => void) | null = null
    const grade = jest.fn(() => new Promise<{
      markdownReport: string
      provider: "llm"
      model: string
      promptVersion: string
    }>((resolve) => {
      resolveGrade = resolve
    }))
    const runner = createEssayGradeFallbackRunner({
      verifiedOcr: { text: "可信作文正文", fileIds: ["page-1"] },
      requestId: "chat-1",
      grade,
    })

    const visualFailure = runner.attempt("visual_node_failure")
    const workflowFailure = runner.attempt("dify_workflow_finished_failure")
    expect(grade).toHaveBeenCalledTimes(1)
    expect(grade).toHaveBeenCalledWith(expect.objectContaining({
      text: "可信作文正文",
      essayId: "chat-1",
      metadata: expect.objectContaining({ reason: "visual_node_failure", file_count: 1 }),
    }))

    resolveGrade!({
      markdownReport: validReport,
      provider: "llm",
      model: "sx-chinese-text",
      promptVersion: "essay-grading-v1",
    })

    await expect(visualFailure).resolves.toMatchObject({ markdownReport: validReport })
    await expect(workflowFailure).resolves.toMatchObject({ markdownReport: validReport })
    expect(runner.getState()).toEqual({
      attempted: true,
      reason: "visual_node_failure",
      errorCode: null,
    })
  })

  it("does not call the grader without verified OCR", async () => {
    const grade = jest.fn()
    const runner = createEssayGradeFallbackRunner({
      verifiedOcr: null,
      requestId: "chat-2",
      grade,
    })

    await expect(runner.attempt("dify_error_failure")).resolves.toBeNull()
    expect(grade).not.toHaveBeenCalled()
    expect(runner.getState().attempted).toBe(false)
  })

  it("does not start grading when the request is already aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    const grade = jest.fn()
    const runner = createEssayGradeFallbackRunner({
      verifiedOcr: { text: "可信作文正文包含足够多的有效文字内容", fileIds: ["page-1"] },
      requestId: "chat-aborted-before-start",
      signal: controller.signal,
      grade,
    })

    await expect(runner.attempt("visual_node_failure")).resolves.toBeNull()
    expect(grade).not.toHaveBeenCalled()
    expect(runner.getState()).toEqual({
      attempted: false,
      reason: null,
      errorCode: null,
    })
  })

  it("passes the signal to grading and discards a result after cancellation", async () => {
    const controller = new AbortController()
    let resolveGrade!: (value: {
      markdownReport: string
      provider: "llm"
      model: string
      promptVersion: string
    }) => void
    const grade = jest.fn(() => new Promise<{
      markdownReport: string
      provider: "llm"
      model: string
      promptVersion: string
    }>((resolve) => {
      resolveGrade = resolve
    }))
    const runner = createEssayGradeFallbackRunner({
      verifiedOcr: { text: "可信作文正文包含足够多的有效文字内容", fileIds: ["page-1"] },
      requestId: "chat-aborted-after-start",
      signal: controller.signal,
      grade,
    })

    const attempt = runner.attempt("visual_node_failure")
    expect(grade).toHaveBeenCalledWith(expect.objectContaining({
      signal: controller.signal,
    }))
    controller.abort()
    resolveGrade({
      markdownReport: validReport,
      provider: "llm",
      model: "sx-chinese-text",
      promptVersion: "essay-grading-v1",
    })

    await expect(attempt).resolves.toBeNull()
    expect(runner.getState()).toEqual({
      attempted: true,
      reason: "visual_node_failure",
      errorCode: null,
    })
  })

  it("rejects an invalid report and keeps the first failure reason", async () => {
    const grade = jest.fn().mockResolvedValue({
      markdownReport: "无法识别作文内容，请重新上传。",
      provider: "llm",
      model: "sx-chinese-text",
      promptVersion: "essay-grading-v1",
    })
    const runner = createEssayGradeFallbackRunner({
      verifiedOcr: { text: "可信作文正文", fileIds: ["page-1"] },
      requestId: "chat-3",
      grade,
    })

    await expect(runner.attempt("invalid_or_empty_dify_report")).resolves.toBeNull()
    await expect(runner.attempt("dify_error_failure")).resolves.toBeNull()
    expect(grade).toHaveBeenCalledTimes(1)
    expect(runner.getState()).toEqual({
      attempted: true,
      reason: "invalid_or_empty_dify_report",
      errorCode: "ESSAY_FALLBACK_GRADE_INVALID",
    })
  })
})
