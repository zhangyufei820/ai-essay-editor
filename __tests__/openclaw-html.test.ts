import { extractPrimaryImageFromOpenClawHtml } from "@/lib/openclaw-html"

describe("OpenClaw HTML artifact image extraction", () => {
  it("extracts a single generated image from an HTML wrapper", () => {
    const html = `
      <!doctype html>
      <html>
        <body>
          <h1>点击查看女子洗衣服图片</h1>
          <img src="./assets/washing.png" alt="女子洗衣服图片" />
        </body>
      </html>
    `

    expect(extractPrimaryImageFromOpenClawHtml(html, "https://www.shenxiang.school/slides/washing.html")).toEqual({
      src: "https://www.shenxiang.school/slides/assets/washing.png",
      alt: "女子洗衣服图片",
    })
  })

  it("prefers Open Graph image metadata when present", () => {
    const html = `
      <html>
        <head><meta property="og:image" content="/slides/cover.webp"></head>
        <body><img src="/slides/thumb.jpg"></body>
      </html>
    `

    expect(extractPrimaryImageFromOpenClawHtml(html, "https://www.shenxiang.school/slides/demo.html")).toEqual({
      src: "https://www.shenxiang.school/slides/cover.webp",
    })
  })

  it("keeps multi-image pages as HTML previews", () => {
    const html = `
      <html>
        <body>
          <img src="/slides/page-1.png">
          <img src="/slides/page-2.png">
        </body>
      </html>
    `

    expect(extractPrimaryImageFromOpenClawHtml(html, "https://www.shenxiang.school/slides/ppt.html")).toBeNull()
  })
})
