import { expect, test, type Page } from "@playwright/test"
import { readE2eCredentials } from "./e2e-secrets"

test.use({ screenshot: "off", trace: "off", video: "off" })

const textRoutes = [
  { path: "/chat/all-in-one-agent", placeholder: "描述你想生成的动画、图片或要处理的文件..." },
  { path: "/chat/vocab-card", placeholder: "例如：你好啊 / 我要学习 apple / 考我一下" },
  { path: "/chat/ai-writing-paper", placeholder: "输入内容开始对话..." },
  { path: "/chat/zhongying-essay", placeholder: "输入内容开始对话..." },
  { path: "/chat/experiment-report", placeholder: "输入内容开始对话..." },
  { path: "/chat/grok-4.2", placeholder: "输入内容开始对话..." },
] as const

async function loginToRoute(page: Page, route: string) {
  const { phone, password } = readE2eCredentials()
  test.skip(!password, "SHENXIANG_E2E_TEST_PASSWORD is not configured")

  await page.goto(`/login?redirect=${encodeURIComponent(route)}`, { waitUntil: "domcontentloaded" })
  await page.locator("#passworLogin_account").fill(phone)
  await page.locator("#passworLogin_password").fill(password)
  await page.locator("button[type='submit']").filter({ hasText: "Sign In" }).click()
  await page.waitForURL(new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), { timeout: 45_000 })
}

async function enterMessage(input: ReturnType<Page["getByPlaceholder"]>, text: string) {
  await input.click()
  await input.clear()
  await input.pressSequentially(text)
}

test.describe("production authenticated routes", () => {
  test.setTimeout(180_000)

  for (const route of textRoutes) {
    test(`${route.path} stays interactive after login redirect`, async ({ page }) => {
      await loginToRoute(page, route.path)

      const input = page.getByPlaceholder(route.placeholder)
      await expect(input).toBeVisible({ timeout: 20_000 })
      await expect(input).toBeEnabled()
      await expect(page.getByRole("button", { name: "登录" })).toHaveCount(0)
      await expect(page.getByText("未登录，")).toHaveCount(0)

      await enterMessage(input, "登录回跳后可正常输入")
      await expect(page.getByRole("button", { name: "发送消息" })).toBeEnabled({ timeout: 20_000 })
    })
  }

  test("/chat/gpt-image-2 keeps image workspace interactive after login redirect", async ({ page }) => {
    await loginToRoute(page, "/chat/gpt-image-2")

    const prompt = page.getByPlaceholder("请输入图片生成或图片编辑提示词，例如：不要改变图片元素，放大至4K。")
    await expect(prompt).toBeVisible({ timeout: 20_000 })
    await expect(prompt).toBeEnabled()
    await expect(page.getByRole("button", { name: "登录" })).toHaveCount(0)
    await expect(page.getByText("请先登录后再上传图片或生成作品。")).toHaveCount(0)

    await enterMessage(prompt, "画一只粉笔风格的抛物线教学示意图")
    await expect(page.getByRole("button", { name: "开始生成", exact: true })).toBeEnabled({ timeout: 20_000 })
  })
})
