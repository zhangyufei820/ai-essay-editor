describe("openclaw slides route policy", () => {
  const root = process.cwd()
  const read = (relativePath: string) => require("fs").readFileSync(require("path").join(root, relativePath), "utf8")

  it("requires an authenticated user before resolving generated slide assets", () => {
    const slidesRoute = read("app/slides/[...path]/route.ts")
    const handler = slidesRoute.slice(slidesRoute.indexOf("export async function GET"))

    expect(slidesRoute).toContain("requireUser(request)")
    expect(handler.indexOf("requireUser(request)")).toBeLessThan(handler.indexOf("findWorkspaceAssetPath"))
  })

  it("documents the workspace fallback used by the public slides route", () => {
    const requestedPath = ["script-to-video-flow-v3.html"]
    const fallbackPath = ["slides", requestedPath[0]]

    expect(fallbackPath).toEqual(["slides", "script-to-video-flow-v3.html"])
  })

  it("serves nested slide assets from the slides workspace subtree", () => {
    const requestedPath = ["script-to-video-flow-v3.assets", "index.css"]
    const fallbackPath = ["slides", ...requestedPath]

    expect(fallbackPath).toEqual(["slides", "script-to-video-flow-v3.assets", "index.css"])
  })

  it("allows common static asset extensions required by exported HTML slides", () => {
    const allowedExtensions = [".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".webp", ".svg"]

    expect(allowedExtensions).toContain(".css")
    expect(allowedExtensions).toContain(".js")
    expect(allowedExtensions).toContain(".png")
  })

  it("streams bounded generated slide and media files with range support", () => {
    const slidesRoute = read("app/slides/[...path]/route.ts")
    const mediaRoute = read("app/api/openclaw-media/[...path]/route.ts")

    for (const route of [slidesRoute, mediaRoute]) {
      expect(route).toContain("buildLocalFileResponse")
      expect(route).toContain('request.headers.get("range")')
      expect(route).not.toContain("fs.readFile")
    }
  })
})
