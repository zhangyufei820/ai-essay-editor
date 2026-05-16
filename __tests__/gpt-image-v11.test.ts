import {
  DEFAULT_IMAGE_INPUTS,
  EDIT_MODE_DEFAULTS,
  GEMINI_IMAGE_DEFAULT_INPUTS,
  buildDifyInputs,
  buildImageProxyUrl,
  extractImageUrlsFromDifyResult,
  getAspectRatioForSize,
  proxifyGeneratedImageDownloadUrl,
  proxifyGeneratedImagePreviewUrl,
  proxifyGeneratedImageUrl,
  resolveSizeForAspectRatio,
} from "@/components/chat/image-generation/gpt-image-v11"
import { readFileSync } from "fs"
import path from "path"

describe("GPT Image V11 parameter mapping", () => {
  it("keeps Gemini image on the direct JSON response branch", () => {
    const source = readFileSync(path.join(process.cwd(), "components/chat/gpt-image2-chat-interface.tsx"), "utf8")

    expect(source).toContain('const isWorkflowImageWorkspace = isBananaWorkspace')
    expect(source).not.toContain('const isWorkflowImageWorkspace = isBananaWorkspace || isGeminiWorkspace')
  })

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
      provider: "openai",
      n: 1,
      reference_image_url: "",
      reference_image_urls: [],
      mask_image_url: "",
    })
  })

  it("keeps Gemini image count in the Dify inputs", () => {
    expect(buildDifyInputs({ ...GEMINI_IMAGE_DEFAULT_INPUTS, n: 3 })).toMatchObject({
      provider: "google",
      model: "gemini-3.1-flash-image-preview",
      image_size: "1K",
      response_modalities: ["TEXT", "IMAGE"],
      n: 3,
    })
  })

  it("maps gateway URLs to reference and mask inputs", () => {
    expect(buildDifyInputs(EDIT_MODE_DEFAULTS, "http://gateway/ref.png", "http://gateway/mask.png")).toMatchObject({
      mode: "image_edit",
      model: "gpt-image-2",
      aspect_ratio: "auto",
      size: "original_4k",
      reference_image_url: "http://gateway/ref.png",
      reference_image_urls: ["http://gateway/ref.png"],
      mask_image_url: "http://gateway/mask.png",
    })
  })

  it("maps multiple reference images for edit mode", () => {
    expect(
      buildDifyInputs(
        EDIT_MODE_DEFAULTS,
        ["http://gateway/ref-1.png", "http://gateway/ref-2.png"],
        "http://gateway/mask.png",
      ),
    ).toMatchObject({
      reference_image_url: "http://gateway/ref-1.png",
      reference_image_urls: ["http://gateway/ref-1.png", "http://gateway/ref-2.png"],
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
      "/api/image-proxy/preview/image.webp?url=http%3A%2F%2F43.154.111.156%3A8001%2Fimages%2Fresult.png&format=webp"
    )
    expect(proxifyGeneratedImageUrl("https://example.com/result.png")).toBe("https://example.com/result.png")
  })

  it("builds optimized preview and raw download image proxy URLs", () => {
    const source = "http://43.154.111.156:8001/images/result.png"
    expect(proxifyGeneratedImagePreviewUrl(source, 1200)).toBe(
      "/api/image-proxy/preview/image.webp?url=http%3A%2F%2F43.154.111.156%3A8001%2Fimages%2Fresult.png&w=1200&format=webp"
    )
    expect(proxifyGeneratedImageDownloadUrl(source)).toBe(
      "/api/image-proxy/raw/image.png?url=http%3A%2F%2F43.154.111.156%3A8001%2Fimages%2Fresult.png&raw=1&download=1"
    )
    expect(proxifyGeneratedImageDownloadUrl(source, "png")).toBe(
      "/api/image-proxy/raw/image.png?url=http%3A%2F%2F43.154.111.156%3A8001%2Fimages%2Fresult.png&raw=1&download=1&format=png"
    )
    expect(proxifyGeneratedImageDownloadUrl(source, "jpeg")).toBe(
      "/api/image-proxy/raw/image.jpg?url=http%3A%2F%2F43.154.111.156%3A8001%2Fimages%2Fresult.png&raw=1&download=1&format=jpeg"
    )
    expect(buildImageProxyUrl("/api/image-proxy?url=http%3A%2F%2F43.154.111.156%3A8001%2Fimages%2Fresult.png", { width: 900 })).toBe(
      "/api/image-proxy/preview/image.webp?url=http%3A%2F%2F43.154.111.156%3A8001%2Fimages%2Fresult.png&w=900&format=webp"
    )
    expect(buildImageProxyUrl("https://shenxiang.school/api/image-proxy/raw/image.png?url=http%3A%2F%2F43.154.111.156%3A8002%2Fimages%2Fresult.png")).toBe(
      "/api/image-proxy/preview/image.webp?url=http%3A%2F%2F43.154.111.156%3A8002%2Fimages%2Fresult.png&format=webp"
    )
  })
})
