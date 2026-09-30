import { expect, test } from "@playwright/test"
import { readE2eCredentials } from "./e2e-secrets"

test.use({ channel: "chrome", screenshot: "off", trace: "off", video: "off" })
test.skip(process.env.RUN_PRODUCTION_E2E !== "1", "Only run against production explicitly")

test("uploads an essay image and renders a grading report in production", async ({ page, context }) => {
  test.setTimeout(300_000)

  const { phone, password } = readE2eCredentials()
  test.skip(!password, "SHENXIANG_E2E_TEST_PASSWORD is not configured")

  const imagePage = await context.newPage()
  await imagePage.setViewportSize({ width: 900, height: 680 })
  await imagePage.setContent(`
    <html><body style="margin:40px;background:#fff;color:#111;font:28px/1.9 sans-serif">
      <h1 style="font-size:34px">难忘的一天</h1>
      <p>星期六早上，阳光照进教室。我和同学们一起去校园种花。</p>
      <p>我们先松土，再把小苗轻轻放进土里，最后浇上清水。</p>
      <p>虽然手上沾满了泥土，但看到整齐的花苗，我心里很高兴。</p>
      <p>这次劳动让我明白，照顾植物需要耐心，也需要大家合作。</p>
    </body></html>
  `)
  const essayImage = await imagePage.screenshot({ fullPage: true })
  await imagePage.close()

  await page.goto("/login?redirect=/chat/standard", { waitUntil: "domcontentloaded" })
  await page.getByRole("tab", { name: "Password" }).click({ timeout: 30_000 })
  await page.locator("#passworLogin_account").fill(phone, { timeout: 30_000 })
  await page.locator("#passworLogin_password").fill(password, { timeout: 30_000 })
  await page.locator("button[type='submit']").filter({ hasText: "Sign In" }).click()
  await page.waitForURL(/\/chat\/standard(?:$|\?)/, { timeout: 45_000 })
  await page.getByPlaceholder("输入内容开始对话...").fill("请批改我上传的作文。")
  await expect(page.getByRole("button", { name: "发送消息" })).toBeEnabled({ timeout: 30_000 })

  const uploadResponse = page.waitForResponse(
    (response) => response.url().includes("/api/dify-upload") && response.request().method() === "POST",
    { timeout: 60_000 },
  )
  await page.locator('input[type="file"][aria-label="文件上传"]').setInputFiles({
    name: "e2e-essay.png",
    mimeType: "image/png",
    buffer: essayImage,
  })
  expect((await uploadResponse).ok()).toBe(true)
  await expect(page.getByText("e2e-essay.png").first()).toBeVisible({ timeout: 30_000 })

  await page.getByRole("button", { name: "发送消息" }).click()

  await expect(page.getByText(/综合评分[:：]?\s*\d+|综合总分[:：]?\s*\d+/).last())
    .toBeVisible({ timeout: 240_000 })
  await expect(page.getByText("修改建议").last()).toBeVisible()
  await expect(page.getByText("当前回复未完整送达")).toHaveCount(0)
})
