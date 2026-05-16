import { readFileSync } from "fs"
import path from "path"

describe("Dify upload routing", () => {
  const source = readFileSync(path.join(process.cwd(), "app/api/dify-upload/route.ts"), "utf8")

  it("routes direct image workspaces through the image gateway", () => {
    expect(source).toContain('new Set(["gpt-image-2", "gemini-image"])')
  })

  it("uses model-specific gateway credentials for uploads", () => {
    expect(source).toContain("const gatewayToken = targetApiKey")
    expect(source).not.toContain("const gatewayToken = process.env.DIFY_IMAGE_GATEWAY_TOKEN || DEFAULT_DIFY_KEY")
  })
})
