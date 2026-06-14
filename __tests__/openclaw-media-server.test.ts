jest.mock("server-only", () => ({}))

import { rewriteOpenClawMediaReferencesWithSignedUrls } from "@/lib/openclaw-media-server"

describe("openclaw media server rewriting", () => {
  it("rewrites OpenClaw workspace presentation links to same-name HTML previews", () => {
    const text = [
      "[点击查看演示文稿](/home/node/.openclaw/workspace/slides/geometry-proof.pptx)",
      "备用: https://www.shenxiang.school/__openclaw__/workspace/slides/lesson.ppt",
      "公开: https://www.shenxiang.school/slides/lesson-2.pptx?download=1",
    ].join("\n")

    expect(rewriteOpenClawMediaReferencesWithSignedUrls(text, undefined, "user-1")).toBe([
      "[点击查看演示文稿](https://www.shenxiang.school/slides/geometry-proof.html)",
      "备用: https://www.shenxiang.school/slides/lesson.html",
      "公开: https://www.shenxiang.school/slides/lesson-2.html?download=1",
    ].join("\n"))
  })
})
