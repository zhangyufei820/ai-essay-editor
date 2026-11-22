import { devices, expect, test, type Page } from "@playwright/test"
import { readE2eCredentials } from "./e2e-secrets"

test.use({ ...devices["Pixel 7"], channel: "chrome", screenshot: "off", trace: "off", video: "off" })
test.skip(process.env.RUN_PRODUCTION_E2E !== "1", "Only run against production explicitly")

const thesisRoute = "/chat/ai-writing-paper"
const inputPlaceholder = "输入内容开始对话..."

async function loginToThesisWriting(page: Page) {
  const { phone, password } = readE2eCredentials()
  test.skip(!password, "SHENXIANG_E2E_TEST_PASSWORD is not configured")
  await page.goto(`/login?redirect=${encodeURIComponent(thesisRoute)}`, { waitUntil: "domcontentloaded" })
  await page.getByRole("tab", { name: "Password" }).click({ timeout: 30_000 })
  await page.locator("#passworLogin_account").fill(phone)
  await page.locator("#passworLogin_password").fill(password)
  await page.locator("button[type='submit']").filter({ hasText: "Sign In" }).click()
  await page.waitForURL(/\/chat\/ai-writing-paper(?:$|\?)/, { timeout: 45_000 })
  await expect(page.getByPlaceholder(inputPlaceholder)).toBeVisible({ timeout: 30_000 })
}

test("论文写作在手机视口生成建议并写入历史", async ({ page }) => {
  test.setTimeout(300_000)
  await loginToThesisWriting(page)
  await page.getByPlaceholder(inputPlaceholder).fill(
    "我的本科论文拟研究高校图书馆座位预约系统对座位利用率的影响。请帮我拟三个具体研究问题，并为每个问题说明可以收集的数据和分析方法。请用中文，控制在400字以内。",
  )
  const chatResponse = page.waitForResponse(
    (response) => response.url().includes("/api/dify-chat") && response.request().method() === "POST",
    { timeout: 45_000 },
  )
  const historySave = page.waitForResponse(
    (response) => response.url().includes("/api/save-message") && response.request().method() === "POST"
      && response.request().postDataJSON()?.role === "assistant",
    { timeout: 220_000 },
  )
  await page.getByRole("button", { name: "发送消息" }).click()
  const response = await chatResponse
  expect(response.ok()).toBe(true)
  expect(response.request().postDataJSON().model).toBe("ai-writing-paper")
  const answer = page.locator("article").last()
  await expect(answer).toContainText(/座位|预约/, { timeout: 190_000 })
  await expect(answer).toContainText(/数据|利用率/)
  await expect(answer).not.toContainText(/"skill"|服务暂时不可用|本次未扣费|当前回复未完整送达/)
  const saved = await historySave
  expect(saved.ok()).toBe(true)
  const sessionId = saved.request().postDataJSON().session_id
  expect(sessionId).toMatch(/^[0-9a-f-]{36}$/i)

  await page.goto(`${thesisRoute}?sessionId=${encodeURIComponent(sessionId)}`, { waitUntil: "domcontentloaded" })
  await expect(page.locator("article").last()).toContainText(/座位|预约/, { timeout: 30_000 })
})

test("手机历史中的旧路由错误没有代码块、分享或奖励入口", async ({ page }) => {
  test.setTimeout(120_000)
  await loginToThesisWriting(page)
  const sessionId = "180686ca-5668-4a99-92c8-1c3a41a7703f"
  await page.route("**/api/chat-session?sessionId=*", (route) => route.fulfill({
    json: {
      session: { id: sessionId, ai_model: "ai-writing-paper" },
      messages: [
        { id: "user", role: "user", content: "请帮我提炼论文问题" },
        { id: "assistant", role: "assistant", content: '```json\n{\n  "skill": "thesis-helper",\n  服务暂时不可用，请稍后重试。\n}\n```' },
      ],
    },
  }))
  await page.goto(`${thesisRoute}?sessionId=${sessionId}`, { waitUntil: "domcontentloaded" })
  await expect(page.getByText("当前回复未完整送达")).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("thesis-helper")).toHaveCount(0)
  await expect(page.getByText("长文分享 +10 积分")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "分享到广场" })).toHaveCount(0)
})
