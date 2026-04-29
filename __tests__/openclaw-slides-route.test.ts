describe("openclaw slides route policy", () => {
  it("documents the public URL contract for generated slide assets", () => {
    const publicUrl = "https://www.shenxiang.school/slides/script-to-storyboard.html"

    expect(publicUrl).toMatch(/^https:\/\/www\.shenxiang\.school\/slides\//)
    expect(publicUrl).toMatch(/\.html$/)
  })
})
