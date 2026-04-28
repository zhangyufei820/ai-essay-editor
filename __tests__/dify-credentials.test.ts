import { getDifyCredentialForModel } from "@/lib/dify-credentials"

describe("Dify credential selection", () => {
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
})
