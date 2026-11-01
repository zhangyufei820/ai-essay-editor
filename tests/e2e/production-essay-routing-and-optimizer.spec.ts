import { expect, test } from "@playwright/test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { readE2eCredentials } from "./e2e-secrets"

test.use({ channel: "chrome", screenshot: "off", trace: "off", video: "off" })
test.skip(process.env.RUN_PRODUCTION_E2E !== "1", "Only run against production explicitly")

async function login(page: import("@playwright/test").Page, route: string) {
  const { phone, password } = readE2eCredentials()
  test.skip(!password, "SHENXIANG_E2E_TEST_PASSWORD is not configured")
  await page.goto(`/login?redirect=${encodeURIComponent(route)}`, { waitUntil: "domcontentloaded" })
  await page.getByRole("tab", { name: "Password" }).click({ timeout: 30_000 })
  await page.locator("#passworLogin_account").fill(phone, { timeout: 30_000 })
  await page.locator("#passworLogin_password").fill(password, { timeout: 30_000 })
  await page.locator("button[type='submit']").filter({ hasText: "Sign In" }).click()
  await page.waitForURL(new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|\\?)`), { timeout: 45_000 })
}

test("image prompt optimization works without a dedicated Dify token", async ({ page }) => {
  test.setTimeout(150_000)
  await login(page, "/chat/gpt-image-2")
  const prompt = page.getByPlaceholder("请输入图片生成或图片编辑提示词，例如：不要改变图片元素，放大至4K。")
  await prompt.fill("一只白猫坐在窗边")
  const optimization = page.waitForResponse((response) =>
    response.url().includes("/api/image-prompt/optimize") && response.request().method() === "POST",
  { timeout: 90_000 })
  await page.getByRole("button", { name: "自动优化" }).click()
  const response = await optimization
  expect(response.ok()).toBe(true)
  await expect(prompt).not.toHaveValue("一只白猫坐在窗边", { timeout: 15_000 })
  await expect(prompt).toHaveValue(/白猫|猫|white cat/i)
})

test("a DOCX and PNG in one essay request produce a complete grade", async ({ page, context }) => {
  test.setTimeout(360_000)
  const imagePage = await context.newPage()
  await imagePage.setContent(`
    <html><body style="margin:32px;background:white;color:black;font:26px/2 sans-serif">
      <h1>劳动课的收获</h1>
      <p>今天的劳动课，我们在校园里种下了花苗。大家先松土，再把花苗放进土里，最后浇上清水。</p>
      <p>我发现每个人认真完成自己的工作，花坛很快就变得整齐漂亮。合作让我学会了倾听和耐心。</p>
    </body></html>
  `)
  const png = await imagePage.screenshot({ fullPage: true })
  await imagePage.close()
  const docx = await readFile(path.join(process.cwd(), "tests/e2e/fixtures/essay-mixed.docx"))

  await login(page, "/chat/standard")
  await page.getByPlaceholder("输入内容开始对话...").fill("请同时参考文档和图片，完整批改这篇作文。")
  await expect(page.getByRole("button", { name: "发送消息" })).toBeEnabled({ timeout: 30_000 })
  const uploads: number[] = []
  page.on("response", (response) => {
    if (response.url().includes("/api/dify-upload") && response.request().method() === "POST") {
      uploads.push(response.status())
    }
  })
  await page.locator('input[type="file"][aria-label="文件上传"]').setInputFiles([
    { name: "e2e-essay.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docx },
    { name: "e2e-essay.png", mimeType: "image/png", buffer: png },
  ])
  await expect.poll(() => uploads.length, { timeout: 100_000 }).toBe(2)
  expect(uploads).toEqual([200, 200])
  await expect(page.getByText("e2e-essay.docx").first()).toBeVisible()
  await expect(page.getByText("e2e-essay.png").first()).toBeVisible()
  await page.getByRole("button", { name: "发送消息" }).click()
  const report = page.locator("article").last()
  await expect.poll(async () => (await report.innerText()).replace(/\s+/g, " "),
    { timeout: 240_000 }).toMatch(/(?:综合评分|综合总分)\s*[:：]?\s*(?:100%\s+)?[1-9]\d*(?=\s|\/|分|$)/)
  await expect(report).toContainText(/种花|花苗/)
  await expect(page.getByText("当前回复未完整送达")).toHaveCount(0)
})
