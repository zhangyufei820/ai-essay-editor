import { expect, test } from "@playwright/test"
import { readE2eCredentials } from "./e2e-secrets"

test.use({ channel: "chrome", screenshot: "off", trace: "off", video: "off" })
test.skip(process.env.RUN_PRODUCTION_E2E !== "1", "Only run against production explicitly")

const cases = [
  { model: "teaching-pro", prompt: "请用两句话说明如何判断课堂教学目标是否达成。", expected: /目标|课堂|学生/ },
  { model: "quanquan-math", prompt: "请解方程 2x+3=11，并写出简短步骤。", expected: /x\s*=\s*4|x＝4|解得.*4/ },
  { model: "quanquan-english", prompt: "请改正 I go to school yesterday. 并解释时态。", expected: /went|过去式|一般过去时/ },
  { model: "banzhuren", prompt: "班里两名学生发生争执，班主任应如何先处理？请给出两步建议。", expected: /学生|沟通|了解/ },
  { model: "problem", prompt: "请解析方程 2x+3=11，给出答案和简短过程。", expected: /x\s*=\s*4|x＝4|解得.*4/ },
] as const

for (const item of cases) {
  test(`${item.model} responds after retrieval removal`, async ({ page }) => {
    test.setTimeout(210_000)
    const { phone, password } = readE2eCredentials()
    test.skip(!password, "SHENXIANG_E2E_TEST_PASSWORD is not configured")

    await page.goto(`/login?redirect=/chat/${item.model}`, { waitUntil: "domcontentloaded" })
    await page.getByRole("tab", { name: "Password" }).click({ timeout: 30_000 })
    await page.locator("#passworLogin_account").fill(phone, { timeout: 30_000 })
    await page.locator("#passworLogin_password").fill(password, { timeout: 30_000 })
    await page.locator("button[type='submit']").filter({ hasText: "Sign In" }).click()
    await page.waitForURL(new RegExp(`/chat/${item.model}(?:$|\\?)`), { timeout: 45_000 })

    await page.getByPlaceholder("输入内容开始对话...").fill(item.prompt)
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/dify-chat") && response.request().method() === "POST",
      { timeout: 60_000 },
    )
    await page.getByRole("button", { name: "发送消息" }).click()
    const response = await responsePromise
    expect(response.ok()).toBe(true)
    expect(await response.text()).not.toContain("DIFY_UPSTREAM_UNAVAILABLE")

    const answer = page.locator("article").last()
    await expect(answer).toContainText(item.expected, { timeout: 150_000 })
    await expect(page.getByText("当前回复未完整送达")).toHaveCount(0)
    expect((await answer.innerText()).length).toBeGreaterThan(40)
  })
}
