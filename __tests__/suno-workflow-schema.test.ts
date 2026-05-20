import {
  buildDifyInputs,
  normalizeBooleanString,
  parseDifyResult,
  validateOperationInput,
} from "@/lib/suno-workflow-schema"

describe("buildDifyInputs", () => {
  it("builds music_custom inputs", () => {
    const inputs = buildDifyInputs({
      operation: "music_custom",
      prompt: "歌词",
      title: "标题",
      tags: "pop, emotional",
      mv: "chirp-v5",
      make_instrumental: false,
    })

    expect(inputs.operation).toBe("music_custom")
    expect(inputs.prompt).toBe("歌词")
    expect(inputs.title).toBe("标题")
    expect(inputs.tags).toBe("pop, emotional")
    expect(inputs.make_instrumental).toBe("false")
    expect(inputs.gateway_api_key).toBe("__SERVER_INJECT__")
  })

  it("normalizes boolean strings", () => {
    expect(normalizeBooleanString(true)).toBe("true")
    expect(normalizeBooleanString(false)).toBe("false")
    expect(buildDifyInputs({ make_instrumental: "true", wait_complete: false }).make_instrumental).toBe("true")
    expect(buildDifyInputs({ wait_complete: false }).wait_complete).toBe("false")
  })

  it("converts empty fields and json defaults", () => {
    const inputs = buildDifyInputs({ operation: "raw", raw_body_json: "", extra_json: "" })

    expect(inputs.prompt).toBe("")
    expect(inputs.raw_body_json).toBe("{}")
    expect(inputs.extra_json).toBe("{}")
    expect(inputs.s3_fields_json).toBe("{}")
  })

  it("normalizes ids from array, newline, and comma forms", () => {
    expect(buildDifyInputs({ ids: ["a", "b"] }).ids).toBe("a\nb")
    expect(buildDifyInputs({ ids: "a\nb" }).ids).toBe("a\nb")
    expect(buildDifyInputs({ ids: "a,b" }).ids).toBe("a\nb")
  })
})

describe("validateOperationInput", () => {
  it("rejects extend without continue_clip_id", () => {
    const result = validateOperationInput({ operation: "music_extend", continue_at: "10", prompt: "x" })
    expect(result.ok).toBe(false)
    expect(result.errors.continue_clip_id).toBeTruthy()
  })

  it("rejects upload_full without file", () => {
    const result = validateOperationInput({ operation: "upload_full" })
    expect(result.ok).toBe(false)
    expect(result.errors.audio_file).toBeTruthy()
  })

  it("rejects raw path outside /suno/", () => {
    const result = validateOperationInput({ operation: "raw", raw_method: "POST", raw_path: "https://example.com", raw_body_json: "{}", extra_json: "{}" })
    expect(result.ok).toBe(false)
    expect(result.errors.raw_path).toBeTruthy()
  })

  it("allows timing with clip_id and no timing_id", () => {
    const result = validateOperationInput({ operation: "timing", clip_id: "clip-1" })
    expect(result.ok).toBe(true)
  })
})

describe("parseDifyResult", () => {
  it("treats Dify string false as failed and does not use workflow task_id as Suno task_id", () => {
    const result = parseDifyResult({
      task_id: "workflow-task-id",
      workflow_run_id: "workflow-run-id",
      data: {
        status: "succeeded",
        outputs: {
          success: "false",
          http_status: 200,
          provider_code: "task_not_exist",
          message: "task_not_exist",
          task_id: "",
          response_json: JSON.stringify({
            success: false,
            status_code: 400,
            provider_code: "task_not_exist",
            message: "task_not_exist",
            task_id: "",
            audio_urls: [],
          }),
          error: "task_not_exist",
        },
      },
    })

    expect(result.success).toBe(false)
    expect(result.task_id).toBe("")
    expect(result.error).toBe("task_not_exist")
  })

  it("extracts the provider task_id from successful workflow outputs", () => {
    const result = parseDifyResult({
      task_id: "workflow-task-id",
      data: {
        status: "succeeded",
        outputs: {
          success: "true",
          http_status: 200,
          task_id: "suno-task-id",
          audio_urls: "",
          response_json: JSON.stringify({
            success: true,
            task_id: "suno-task-id",
          }),
        },
      },
    })

    expect(result.success).toBe(true)
    expect(result.task_id).toBe("suno-task-id")
  })

  it("extracts nested provider channel errors from response_json", () => {
    const result = parseDifyResult({
      data: {
        status: "succeeded",
        outputs: {
          success: "false",
          response_json: JSON.stringify({
            success: false,
            status_code: 503,
            provider_code: "provider_error",
            provider_response: {
              error: {
                message: "分组 default 下模型 suno_music 无可用渠道（distributor）",
                type: "new_api_error",
              },
            },
          }),
          error: "请求失败",
        },
      },
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("suno_music 无可用渠道")
  })
})
