import { expect, test } from "@playwright/test"
import { readE2eCredentials } from "./e2e-secrets"

test.use({ channel: "chrome", screenshot: "off", trace: "off", video: "off" })
test.skip(process.env.RUN_PRODUCTION_E2E !== "1", "Only run against production explicitly")

test("Open Claw responds after its Dify model switches to GPT 5.6 Sol", async ({ page }) => {
  test.setTimeout(210_000)
  const { phone, password } = readE2eCredentials()
  test.skip(!password, "SHENXIANG_E2E_TEST_PASSWORD is not configured")

  await page.goto("/login?redirect=/chat/open-claw", { waitUntil: "domcontentloaded" })
  await page.getByRole("tab", { name: "Password" }).click({ timeout: 30_000 })
  await page.locator("#passworLogin_account").fill(phone, { timeout: 30_000 })
  await page.locator("#passworLogin_password").fill(password, { timeout: 30_000 })
  await page.locator("button[type='submit']").filter({ hasText: "Sign In" }).click()
  await page.waitForURL(/\/chat\/open-claw(?:$|\?)/, { timeout: 45_000 })

  await page.getByPlaceholder("输入内容开始对话...").fill("请用两句话说明怎样把错题整理成复习计划。")
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/dify-chat") && response.request().method() === "POST",
    { timeout: 60_000 },
  )
  await page.getByRole("button", { name: "发送消息" }).click()
  const response = await responsePromise
  expect(response.ok()).toBe(true)
  expect(await response.text()).not.toContain("DIFY_UPSTREAM_UNAVAILABLE")

  const answer = page.locator("article").last()
  await expect(answer).toContainText(/错题|复习|计划/, { timeout: 150_000 })
  await expect(page.getByText("当前回复未完整送达")).toHaveCount(0)
  expect((await answer.innerText()).length).toBeGreaterThan(30)
})
