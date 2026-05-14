import { getDifyCredentialForModel } from "@/lib/dify-credentials"

describe("Dify credential selection", () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})

  afterAll(() => {
    warnSpy.mockRestore()
  })

  it("uses the image gateway token for GPT Image 2", () => {
    const selection = getDifyCredentialForModel("gpt-image-2", {
      DIFY_GPT_IMAGE_API_KEY: "invalid-dify-app-key",
      DIFY_IMAGE_GATEWAY_TOKEN: "gateway-token",
      ESSAY_CORRECTION_API_KEY: "default-key",
    })

    expect(selection).toEqual({
      credential: "gateway-token",
      source: "DIFY_IMAGE_GATEWAY_TOKEN",
    })
  })

  it("uses the dedicated Gemini image workflow key when configured", () => {
    const selection = getDifyCredentialForModel("gemini-image", {
      DIFY_GEMINI_IMAGE_API_KEY: "gemini-image-key",
      ESSAY_CORRECTION_API_KEY: "default-key",
    })

    expect(selection).toEqual({
      credential: "gemini-image-key",
      source: "DIFY_GEMINI_IMAGE_API_KEY",
    })
  })

  it("does not silently fall back for Gemini image in production", () => {
    const selection = getDifyCredentialForModel("gemini-image", {
      NODE_ENV: "production",
      DIFY_API_KEY: "chat-key",
      ESSAY_CORRECTION_API_KEY: "default-key",
    })

    expect(selection).toEqual({
      credential: "",
      source: "DIFY_GEMINI_IMAGE_API_KEY",
    })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("DIFY_GEMINI_IMAGE_API_KEY is required"))
  })

  it("falls back to the default credential when a model-specific key is missing", () => {
    const selection = getDifyCredentialForModel("gpt-5", {
      ESSAY_CORRECTION_API_KEY: "default-key",
    })

    expect(selection).toEqual({
      credential: "default-key",
      source: "DEFAULT_DIFY_KEY",
    })
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

  it("supports the legacy DIFY_API_KEY for general-chat in production", () => {
    const selection = getDifyCredentialForModel("general-chat", {
      NODE_ENV: "production",
      DIFY_API_KEY: "legacy-general-chat-key",
      DIFY_API_KEY_GPT5: "heavy-key",
      ESSAY_CORRECTION_API_KEY: "essay-key",
    })

    expect(selection).toEqual({
      credential: "legacy-general-chat-key",
      source: "DIFY_API_KEY",
    })
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
      source: "DIFY_GENERAL_CHAT_API_KEY or DIFY_API_KEY",
    })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("DIFY_GENERAL_CHAT_API_KEY or DIFY_API_KEY is required"))
  })
})
