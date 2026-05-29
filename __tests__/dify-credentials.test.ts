import { getDifyCredentialForModel } from "@/lib/dify-credentials"

describe("Dify credential selection", () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})

  afterAll(() => {
    warnSpy.mockRestore()
  })

  it("uses the dedicated Dify GPT Image chatflow key for GPT Image 2", () => {
    const selection = getDifyCredentialForModel("gpt-image-2", {
      DIFY_GPT_IMAGE_API_KEY: "dify-gpt-image-key",
      DIFY_IMAGE_GATEWAY_TOKEN: "gateway-token",
      ESSAY_CORRECTION_API_KEY: "default-key",
    })

    expect(selection).toEqual({
      credential: "dify-gpt-image-key",
      source: "DIFY_GPT_IMAGE_API_KEY",
    })
  })

  it("does not select a Dify credential for Banana image generation", () => {
    const selection = getDifyCredentialForModel("banana-2-pro", {
      NODE_ENV: "production",
      DIFY_BANANA_API_KEY: "banana-key",
      ESSAY_CORRECTION_API_KEY: "essay-key",
      DIFY_API_KEY: "general-key",
    })

    expect(selection).toEqual({
      credential: "",
      source: "GEMINI_IMAGE_GATEWAY",
    })
  })

  it("does not let Banana fall back to essay-correction Dify credentials", () => {
    const selection = getDifyCredentialForModel("banana-2-pro", {
      NODE_ENV: "production",
      DIFY_BANANA_API_KEY: "essay-key",
      ESSAY_CORRECTION_API_KEY: "essay-key",
      DIFY_API_KEY: "general-key",
    })

    expect(selection).toEqual({
      credential: "",
      source: "GEMINI_IMAGE_GATEWAY",
    })
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("DIFY_BANANA_API_KEY"))
  })

  it("does not select a Dify credential for Gemini image generation", () => {
    const selection = getDifyCredentialForModel("gemini-image", {
      DIFY_GEMINI_IMAGE_API_KEY: "gemini-image-key",
      ESSAY_CORRECTION_API_KEY: "default-key",
    })

    expect(selection).toEqual({
      credential: "",
      source: "GEMINI_IMAGE_GATEWAY",
    })
  })

  it("does not let Gemini image fall back to Dify chat credentials", () => {
    const selection = getDifyCredentialForModel("gemini-image", {
      NODE_ENV: "production",
      DIFY_API_KEY: "chat-key",
      ESSAY_CORRECTION_API_KEY: "default-key",
    })

    expect(selection).toEqual({
      credential: "",
      source: "GEMINI_IMAGE_GATEWAY",
    })
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("DIFY_GEMINI_IMAGE_API_KEY"))
  })

  it("does not fall back when a model-specific key is missing", () => {
    const selection = getDifyCredentialForModel("gpt-5", {
      ESSAY_CORRECTION_API_KEY: "default-key",
    })

    expect(selection).toEqual({
      credential: "",
      source: "DIFY_API_KEY_GPT5",
    })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("DIFY_API_KEY_GPT5 is required"))
  })

  it("uses the dedicated general-chat key when configured", () => {
    const selection = getDifyCredentialForModel("general-chat", {
      NODE_ENV: "production",
      DIFY_GENERAL_CHAT_API_KEY: "general-chat-key",
      DIFY_API_KEY_GPT5: "heavy-key",
      ESSAY_CORRECTION_API_KEY: "essay-key",
    })

    expect(selection).toEqual({
      credential: "general-chat-key",
      source: "DIFY_GENERAL_CHAT_API_KEY",
    })
  })

  it("does not use the legacy DIFY_API_KEY for general-chat", () => {
    const selection = getDifyCredentialForModel("general-chat", {
      NODE_ENV: "production",
      DIFY_API_KEY: "legacy-general-chat-key",
      DIFY_API_KEY_GPT5: "heavy-key",
      ESSAY_CORRECTION_API_KEY: "essay-key",
    })

    expect(selection).toEqual({
      credential: "",
      source: "DIFY_GENERAL_CHAT_API_KEY",
    })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("DIFY_GENERAL_CHAT_API_KEY is required"))
  })

  it("uses the dedicated worksheet diagnosis workflow key when configured", () => {
    const selection = getDifyCredentialForModel("worksheet-diagnosis", {
      DIFY_WORKSHEET_DIAGNOSIS_API_KEY: "worksheet-key",
      ESSAY_CORRECTION_API_KEY: "default-key",
    })

    expect(selection).toEqual({
      credential: "worksheet-key",
      source: "DIFY_WORKSHEET_DIAGNOSIS_API_KEY",
    })
  })

  it("uses the dedicated experiment report workflow key when configured", () => {
    const selection = getDifyCredentialForModel("experiment-report", {
      DIFY_EXPERIMENT_REPORT_API_KEY: "experiment-report-key",
      DIFY_AI_WRITING_PAPER_API_KEY: "writing-paper-key",
      ESSAY_CORRECTION_API_KEY: "default-key",
    })

    expect(selection).toEqual({
      credential: "experiment-report-key",
      source: "DIFY_EXPERIMENT_REPORT_API_KEY",
    })
  })

  it("uses the dedicated all-in-one agent workflow key when configured", () => {
    const selection = getDifyCredentialForModel("all-in-one-agent", {
      DIFY_ALL_IN_ONE_AGENT_API_KEY: "all-in-one-key",
      ESSAY_CORRECTION_API_KEY: "default-key",
    })

    expect(selection).toEqual({
      credential: "all-in-one-key",
      source: "DIFY_ALL_IN_ONE_AGENT_API_KEY",
    })
  })

  it("uses the dedicated super all-in-one agent key when configured", () => {
    const selection = getDifyCredentialForModel("super-all-in-one-agent", {
      DIFY_SUPER_ALL_IN_ONE_AGENT_API_KEY: "super-all-in-one-key",
      ESSAY_CORRECTION_API_KEY: "default-key",
    })

    expect(selection).toEqual({
      credential: "super-all-in-one-key",
      source: "DIFY_SUPER_ALL_IN_ONE_AGENT_API_KEY",
    })
  })

  it("uses the shared workflow skill key when configured", () => {
    const selection = getDifyCredentialForModel("workflow-skill", {
      DIFY_WORKFLOW_SKILL_API_KEY: "workflow-skill-key",
      ESSAY_CORRECTION_API_KEY: "default-key",
    })

    expect(selection).toEqual({
      credential: "workflow-skill-key",
      source: "DIFY_WORKFLOW_SKILL_API_KEY",
    })
  })

  it("does not silently fall back for shared workflow skills in production", () => {
    const selection = getDifyCredentialForModel("workflow-skill", {
      NODE_ENV: "production",
      DIFY_API_KEY: "chat-key",
      ESSAY_CORRECTION_API_KEY: "default-key",
    })

    expect(selection).toEqual({
      credential: "",
      source: "DIFY_WORKFLOW_SKILL_API_KEY",
    })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("DIFY_WORKFLOW_SKILL_API_KEY is required"))
  })

  it("does not silently fall back for super all-in-one agent in production", () => {
    const selection = getDifyCredentialForModel("super-all-in-one-agent", {
      NODE_ENV: "production",
      DIFY_API_KEY: "chat-key",
      ESSAY_CORRECTION_API_KEY: "default-key",
    })

    expect(selection).toEqual({
      credential: "",
      source: "DIFY_SUPER_ALL_IN_ONE_AGENT_API_KEY",
    })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("DIFY_SUPER_ALL_IN_ONE_AGENT_API_KEY is required"))
  })

  it("uses the dedicated OpenClaw key when configured", () => {
    const selection = getDifyCredentialForModel("open-claw", {
      NODE_ENV: "production",
      DIFY_API_KEY_OPENCLAW: "openclaw-key",
      DIFY_API_KEY: "chat-key",
      ESSAY_CORRECTION_API_KEY: "essay-key",
    })

    expect(selection).toEqual({
      credential: "openclaw-key",
      source: "DIFY_API_KEY_OPENCLAW",
    })
  })

  it("does not silently fall back for OpenClaw in production", () => {
    const selection = getDifyCredentialForModel("open-claw", {
      NODE_ENV: "production",
      DIFY_API_KEY: "chat-key",
      ESSAY_CORRECTION_API_KEY: "essay-key",
    })

    expect(selection).toEqual({
      credential: "",
      source: "DIFY_API_KEY_OPENCLAW",
    })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("DIFY_API_KEY_OPENCLAW is required"))
  })

  it("does not silently fall back to a chat key for worksheet diagnosis in production", () => {
    const selection = getDifyCredentialForModel("worksheet-diagnosis", {
      NODE_ENV: "production",
      DIFY_API_KEY: "chat-key",
      ESSAY_CORRECTION_API_KEY: "default-key",
    })

    expect(selection).toEqual({
      credential: "",
      source: "DIFY_WORKSHEET_DIAGNOSIS_API_KEY",
    })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("DIFY_WORKSHEET_DIAGNOSIS_API_KEY is required"))
  })

  it("does not silently fall back to a heavy key for general-chat in production", () => {
    const selection = getDifyCredentialForModel("general-chat", {
      NODE_ENV: "production",
      DIFY_API_KEY_GPT5: "heavy-key",
      ESSAY_CORRECTION_API_KEY: "essay-key",
    })

    expect(selection).toEqual({
      credential: "",
      source: "DIFY_GENERAL_CHAT_API_KEY",
    })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("DIFY_GENERAL_CHAT_API_KEY is required"))
  })

  it("uses the dedicated essay correction key for the standard model", () => {
    const selection = getDifyCredentialForModel("standard", {
      NODE_ENV: "production",
      ESSAY_CORRECTION_API_KEY: "essay-key",
      DIFY_GENERAL_CHAT_API_KEY: "general-key",
    })

    expect(selection).toEqual({
      credential: "essay-key",
      source: "ESSAY_CORRECTION_API_KEY",
    })
  })

  it("rejects unsupported models instead of using any default key", () => {
    const selection = getDifyCredentialForModel("unknown-model", {
      NODE_ENV: "production",
      ESSAY_CORRECTION_API_KEY: "essay-key",
      DIFY_GENERAL_CHAT_API_KEY: "general-key",
    })

    expect(selection).toEqual({
      credential: "",
      source: "UNSUPPORTED_DIFY_MODEL",
    })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Unsupported Dify model"))
  })
})
