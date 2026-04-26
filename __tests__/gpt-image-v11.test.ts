import {
  DEFAULT_IMAGE_INPUTS,
  EDIT_MODE_DEFAULTS,
  buildDifyInputs,
  extractImageUrlsFromDifyResult,
  getAspectRatioForSize,
  proxifyGeneratedImageUrl,
  resolveSizeForAspectRatio,
} from "@/components/chat/image-generation/gpt-image-v11"

describe("GPT Image V11 parameter mapping", () => {
  it("builds complete default text-to-image inputs", () => {
    expect(buildDifyInputs(DEFAULT_IMAGE_INPUTS)).toEqual({
      mode: "image_generate",
      model: "gpt-image-1",
      aspect_ratio: "1:1",
      size: "1024x1024",
      quality: "medium",
      output_format: "png",
      output_compression: 100,
      background: "auto",
      moderation: "auto",
      n: 1,
      reference_image_url: "",
      mask_image_url: "",
    })
  })

  it("maps gateway URLs to reference and mask inputs", () => {
    expect(buildDifyInputs(EDIT_MODE_DEFAULTS, "http://gateway/ref.png", "http://gateway/mask.png")).toMatchObject({
      mode: "image_edit",
      model: "gpt-image-2",
      aspect_ratio: "auto",
      size: "original_4k",
      reference_image_url: "http://gateway/ref.png",
      mask_image_url: "http://gateway/mask.png",
    })
  })

  it("derives aspect ratios from fixed sizes", () => {
    expect(getAspectRatioForSize("1024x1024")).toBe("1:1")
    expect(getAspectRatioForSize("3840x2160")).toBe("16:9")
    expect(getAspectRatioForSize("2160x3840")).toBe("9:16")
  })

  it("resolves conflicting aspect ratio and 4K size selections", () => {
    expect(resolveSizeForAspectRatio("9:16", "3840x2160").size).toBe("2160x3840")
    expect(resolveSizeForAspectRatio("16:9", "2160x3840").size).toBe("3840x2160")
    expect(resolveSizeForAspectRatio("1:1", "3840x2160").size).toBe("2048x2048")
  })

  it("extracts image URLs from common Dify response shapes", () => {
    expect(
      extractImageUrlsFromDifyResult({
        answer: "![result](https://example.com/a.png)",
        data: {
          image_url: "https://example.com/b.webp",
          image_urls: ["https://example.com/c.jpg"],
        },
      })
    ).toEqual(["https://example.com/a.png", "https://example.com/b.webp", "https://example.com/c.jpg"])
  })

  it("proxifies insecure image gateway URLs for HTTPS pages", () => {
    expect(proxifyGeneratedImageUrl("http://43.154.111.156:8001/images/result.png")).toBe(
      "/api/image-proxy?url=http%3A%2F%2F43.154.111.156%3A8001%2Fimages%2Fresult.png"
    )
    expect(proxifyGeneratedImageUrl("https://example.com/result.png")).toBe("https://example.com/result.png")
  })
})
