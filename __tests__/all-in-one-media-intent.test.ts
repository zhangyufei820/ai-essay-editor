import { detectAllInOneMediaRequest } from "@/lib/all-in-one-media-intent"

describe("all-in-one media intent detection", () => {
  it("does not route negated image or video requests to media gateways", () => {
    expect(detectAllInOneMediaRequest("请用文字说明教学脚本，不要生成图片或视频。", {})).toBe("unknown")
    expect(detectAllInOneMediaRequest("只给我方案，不生成视频", {})).toBe("unknown")
    expect(detectAllInOneMediaRequest("只要文字，不要图片", {})).toBe("unknown")
    expect(detectAllInOneMediaRequest("write the script only, do not generate video or image", {})).toBe("unknown")
    expect(detectAllInOneMediaRequest("write the script only, do not generate image or video", {})).toBe("unknown")
  })

  it("keeps explicit media generation requests routed to the right gateway family", () => {
    expect(detectAllInOneMediaRequest("请生成一个勾股定理演示视频", {})).toBe("video")
    expect(detectAllInOneMediaRequest("请生成一张勾股定理海报", {})).toBe("image")
    expect(detectAllInOneMediaRequest("create a short film about triangles", {})).toBe("video")
    expect(detectAllInOneMediaRequest("generate a poster about triangles", {})).toBe("image")
  })

  it("uses structured all-in-one inputs when query text is generic", () => {
    expect(detectAllInOneMediaRequest("请根据用户需求生成内容", {
      user_intent: "不要生成图片或视频，只输出文字脚本",
    })).toBe("unknown")
    expect(detectAllInOneMediaRequest("请根据用户需求生成内容", {
      task_type: "text-to-video",
    })).toBe("video")
  })
})
