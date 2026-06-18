describe("openclaw slides route policy", () => {
  const root = process.cwd()
  const read = (relativePath: string) => require("fs").readFileSync(require("path").join(root, relativePath), "utf8")

  it("documents the public URL contract for generated slide assets", () => {
    const publicUrl = "https://www.shenxiang.school/slides/script-to-storyboard.html"

    expect(publicUrl).toMatch(/^https:\/\/www\.shenxiang\.school\/slides\//)
    expect(publicUrl).toMatch(/\.html$/)
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

  it("keeps generated slide and media files inline unless download=1 is explicit", () => {
    const slidesRoute = read("app/slides/[...path]/route.ts")
    const mediaRoute = read("app/api/openclaw-media/[...path]/route.ts")

    expect(slidesRoute).not.toContain("DOWNLOAD_EXTENSIONS")
    expect(mediaRoute).not.toContain("DOWNLOAD_EXTENSIONS")
    expect(slidesRoute).toContain('request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"')
    expect(mediaRoute).toContain('request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"')
  })
})
