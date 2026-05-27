import { expect, test } from "@playwright/test"

test.describe("production free-trial smoke", () => {
  test("loads chat and tools from the deployed frontend bundle", async ({ page }) => {
    await page.goto("/chat", { waitUntil: "domcontentloaded" })
    await expect(page.getByPlaceholder(/输入内容开始对话|请先登录/)).toBeVisible()

    const chunkUrls = await page.locator("script[src*='/_next/static/chunks/']").evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLScriptElement).src),
    )
    expect(chunkUrls.some((src) => src.includes("dpl="))).toBe(true)

    await page.goto("/tools", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText(/工具|AI/)
  })

  test("does not expose the stale insufficient-credit toast copy in the loaded chat bundle", async ({ page }) => {
    await page.goto("/chat", { waitUntil: "domcontentloaded" })
    await expect(page.locator("script[src*='/_next/static/chunks/']").first()).toBeAttached()
    const scriptUrls = await page.locator("script[src*='/_next/static/chunks/']").evaluateAll((nodes) =>
      nodes
        .map((node) => (node as HTMLScriptElement).src)
        .filter((src) => src.includes(".js")),
    )

    const chunks = await Promise.all(
      scriptUrls.map(async (url) => {
        const response = await page.request.get(url)
        return response.ok() ? response.text() : ""
      }),
    )
    const bundleText = chunks.join("\n")

    expect(bundleText).toContain("体验额度")
    expect(bundleText).not.toContain("需要 52 积分，当前 48")
  })
})
