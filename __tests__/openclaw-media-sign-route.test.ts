jest.mock("@/lib/openclaw-media-server", () => ({
  createSignedOpenClawMediaUrl: jest.fn((mediaPath: string) => `/api/openclaw-media/${mediaPath}?exp=123&sig=testsig`),
}))

import { NextRequest } from "next/server"

import { GET } from "@/app/api/openclaw-media-sign/[...path]/route"

describe("openclaw media sign route", () => {
  it("redirects valid media paths to a signed media URL", async () => {
    const request = new NextRequest("https://www.shenxiang.school/api/openclaw-media-sign/tool-image-generation/image-1.png")
    const response = await GET(request, {
      params: Promise.resolve({ path: ["tool-image-generation", "image-1.png"] }),
    })

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "https://www.shenxiang.school/api/openclaw-media/tool-image-generation/image-1.png?exp=123&sig=testsig",
    )
    expect(response.headers.get("cache-control")).toBe("private, no-store")
  })

  it("rejects path traversal attempts", async () => {
    const request = new NextRequest("https://www.shenxiang.school/api/openclaw-media-sign/../secret.txt")
    const response = await GET(request, {
      params: Promise.resolve({ path: ["..", "secret.txt"] }),
    })

    expect(response.status).toBe(400)
  })
})
