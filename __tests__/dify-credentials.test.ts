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
})
