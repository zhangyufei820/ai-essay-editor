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

describe("GPT Image V11 parameter mapping", () => {
  it("builds complete default text-to-image inputs", () => {
    expect(buildDifyInputs(DEFAULT_IMAGE_INPUTS)).toEqual({
      mode: "image_generate",
      model: "gpt-image-2",
      aspect_ratio: "1:1",
      size: "2K",
      quality: "low",
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
      model: "gemini-3-pro-image-preview",
      aspect_ratio: "auto",
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
      size: "2K",
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

  it("passes source image dimensions for aspect-preserving edit requests", () => {
    expect(
      buildDifyInputs({
        ...EDIT_MODE_DEFAULTS,
        size: "4K",
        source_image_width: 2500,
        source_image_height: 3500,
      }, "http://gateway/ref.png")
    ).toMatchObject({
      mode: "image_edit",
      size: "4K",
      source_image_width: 2500,
      source_image_height: 3500,
      reference_image_url: "http://gateway/ref.png",
    })
  })

  it("derives aspect ratios from fixed sizes", () => {
    expect(getAspectRatioForSize("1024x1024")).toBe("1:1")
    expect(getAspectRatioForSize("3840x2160")).toBe("16:9")
    expect(getAspectRatioForSize("2160x3840")).toBe("9:16")
  })

  it("keeps selected sizes unchanged when aspect ratio changes", () => {
    expect(resolveSizeForAspectRatio("9:16", "3840x2160").size).toBe("3840x2160")
    expect(resolveSizeForAspectRatio("16:9", "2160x3840").size).toBe("2160x3840")
    expect(resolveSizeForAspectRatio("1:1", "3840x2160").size).toBe("3840x2160")
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

  it("keeps Image 2 direct gateway sizes normalized before submission", () => {
    const routeSource = require("fs").readFileSync(require("path").join(process.cwd(), "app/api/dify-chat/route.ts"), "utf8")

    expect(routeSource).toContain("function normalizeImageGatewaySize")
    expect(routeSource).toContain("function normalizeVivaApiImageSize")
    expect(routeSource).toContain("VIVAAPI_IMAGE_SIZE_TABLE")
    expect(routeSource).toContain('"3:2": "3520x2336"')
    expect(routeSource).toContain("getNearestVivaApiAspectRatio")
    expect(routeSource).toContain('requestedAspectRatio === "auto"')
    expect(routeSource).toContain('if (size === "1K") return "1024x1024"')
    expect(routeSource).toContain('if (size === "2K") return "2048x2048"')
    expect(routeSource).toContain("getImageSizeForSourceAspectRatio")
    expect(routeSource).toContain("source_image_width")
    expect(routeSource).toContain("source_image_height")
    expect(routeSource).toContain('inputs.mode === "image_edit"')
    expect(routeSource).toContain('if (size === "4K") return isPortrait ? "2160x3840" : "3840x2160"')
    expect(routeSource).toContain('return "2048x2048"')
    expect(routeSource).toContain('const VIVAAPI_IMAGE_MODEL = process.env.VIVAAPI_IMAGE_MODEL || "gpt-image-2-vip"')
    expect(routeSource).not.toContain("3840x3840")
    expect(routeSource).not.toContain("4096x4096")
    expect(routeSource).toContain("VIVAAPI_IMAGE_BASE_URL")
    expect(routeSource).toContain('const GEMINI_IMAGE_GATEWAY_URL = (process.env.GEMINI_IMAGE_GATEWAY_URL || "https://moonapix.com")')
    expect(routeSource).toContain("/v1/images/generations")
    expect(routeSource).toContain("buildLegacyGeminiImageGatewayPayload")
    expect(routeSource).toContain('model: "gemini-3-pro-image-preview"')
    expect(routeSource).toContain('aspect_ratio: "auto"')
    expect(routeSource).toContain("resolveGeminiGatewayAspectRatio")
    expect(routeSource).toContain("getNearestGeminiAspectRatioForSource")
    expect(routeSource).toContain("GEMINI_IMAGE_BLANK_RESULT")
    expect(routeSource).toContain("GEMINI_IMAGE_BLANK_RETRY_LIMIT = 1")
    expect(routeSource).toContain("GEMINI_IMAGE_LOW_DETAIL_MAX_LUMINANCE_STDDEV")
    expect(routeSource).toContain("GEMINI_IMAGE_LOW_DETAIL_MAX_EDGE_DELTA")
    expect(routeSource).toContain("luminanceStdDev")
    expect(routeSource).toContain("strongEdgeRatio")
    expect(routeSource).toContain('reason: isBlank ? "blank" : isLowDetail ? "low_detail" : undefined')
    expect(routeSource).toContain("Gemini 图片网关返回空白图片，正在自动重试")
    expect(routeSource).toContain("inspectGeneratedImagesForBlankOutput")
    expect(routeSource).toContain("result_quality: \"blank_or_invalid\"")
    expect(routeSource).toContain("gateway_status: \"retrying\"")
    expect(routeSource).toContain("next_attempt: gatewayAttempt + 1")
    expect(routeSource).toContain("startGeminiImageGatewayTask")
    expect(routeSource).toContain("runGeminiImageGatewayTask")
    expect(routeSource).toContain("Gemini 图片任务已提交")
    expect(routeSource).toContain("RecoverableGeminiImageTask")
    expect(routeSource).toContain("buildRecoverableGeminiImageTask")
    expect(routeSource).toContain("recoverGeminiImageGatewayTask")
    expect(routeSource).toContain("SERVER_STARTED_AT_MS")
    expect(routeSource).toContain("/v1/images/generations")
    expect(routeSource).toContain("/v1/images/edits")
    expect(routeSource).toContain('const isEditMode = imageInputs.mode === "image_edit"')
    expect(routeSource).toContain("buildVivaApiImageEditFormData")
    expect(routeSource).toContain('appendRemoteImageToFormData(formData, "image"')
    expect(routeSource).toContain('if (!isGptImage2VipModel() && imageInputs.quality) formData.append("quality", imageInputs.quality)')
    expect(routeSource).toContain("normalizeVivaApiEditSourceImage")
    expect(routeSource).toContain("VIVAAPI_EDIT_MAX_SOURCE_BYTES")
    expect(routeSource).toContain("VIVAAPI_EDIT_MAX_SOURCE_DIMENSION = 2048")
    expect(routeSource).toContain("VIVAAPI_EDIT_RETRY_SOURCE_DIMENSION = 1536")
    expect(routeSource).toContain("shouldRetryVivaApiImageResponse")
    expect(routeSource).toContain('resultText.includes("upstream_error")')
    expect(routeSource).toContain('resultText.includes("system error")')
    expect(routeSource).toContain("submitVivaApiImageRequest")
    expect(routeSource).toContain("图片编辑服务返回临时错误，正在自动重试")
    expect(routeSource).toContain("gateway_status: \"retrying\"")
    expect(routeSource).toContain("edit_sources: editSourceMetadata")
    expect(routeSource).toContain('gateway_path: gatewayPath')
    expect(routeSource).toContain("buildVivaApiImagePayload")
    expect(routeSource).toContain("size: normalizeVivaApiImageSize(imageInputs)")
    expect(routeSource).toContain("const gatewaySize = normalizeVivaApiImageSize(imageInputs)")
    expect(routeSource).toContain("let gatewaySize = normalizeVivaApiImageSize(imageInputs)")
    expect(routeSource).toContain("nestedError.message")
    expect(routeSource).not.toContain("getImageGatewaySizeByTier")
    expect(routeSource).not.toContain("size: imageInputs.size,")
    expect(routeSource).not.toContain('formData.append("size", normalizeImageGatewaySize')
  })

  it("submits Gemini and Banana image requests as async tasks to avoid edge timeouts", () => {
    const source = require("fs").readFileSync(require("path").join(process.cwd(), "components/chat/gpt-image2-chat-interface.tsx"), "utf8")
    const routeSource = require("fs").readFileSync(require("path").join(process.cwd(), "app/api/dify-chat/route.ts"), "utf8")

    expect(source).toContain('async_image_task: workspaceModel === "gpt-image-2" || workspaceModel === "gemini-image" || workspaceModel === "banana-2-pro"')
    expect(source).toContain("pollImageTask(payload.imageTaskId")
    expect(source).toContain('if (isWorkflowImageWorkspace)')
    expect(source).toContain('let payload = await readResponseJson(response)')
    expect(source).toContain('payload?.status === "running" && typeof payload?.imageTaskId === "string"')
    expect(routeSource).toContain("const taskRun = isDirectImageGatewayRequest && async_image_task === true")
    expect(routeSource).toContain('code: "IMAGE_TASK_TRACE_UNAVAILABLE"')
    expect(routeSource).toContain("taskCreatedBeforeThisProcess")
    expect(routeSource).toContain('gateway_status: "recovered"')
  })
})
