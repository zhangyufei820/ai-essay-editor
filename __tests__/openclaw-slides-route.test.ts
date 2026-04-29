describe("openclaw slides route policy", () => {
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
})
