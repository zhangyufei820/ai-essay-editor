import { expect, test } from "@playwright/test"
import { readE2eCredentials } from "./e2e-secrets"

test.describe("production authenticated chat", () => {
  test.setTimeout(120_000)

  test("logs in with the E2E account and submits without the stale credit guard", async ({ page }) => {
    const { phone, password } = readE2eCredentials()
    test.skip(!password, "SHENXIANG_E2E_TEST_PASSWORD is not configured")

    const consoleErrors: string[] = []
    page.on("console", (message) => {
      if (message.type() === "error") {
        const text = message.text()
        if (!text.includes("Loading plugin data from 'data:image/svg+xml")) {
          consoleErrors.push(text)
        }
      }
    })

    await page.goto("/login?redirect=/chat", { waitUntil: "domcontentloaded" })
    const trialDialog = page.getByRole("dialog", { name: "沈翔智学 60 天共创体验计划" })
    if (await trialDialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await trialDialog.getByRole("button", { name: "稍后再说" }).click()
      await expect(trialDialog).toBeHidden()
    }

    await page.locator("#passworLogin_account").fill(phone)
    await page.locator("#passworLogin_password").fill(password)
    await page.locator("button[type='submit']").filter({ hasText: "Sign In" }).click()

    await page.waitForURL(/\/chat(?:$|\?)/, { timeout: 45_000 })
    await expect(page.getByPlaceholder("输入内容开始对话...")).toBeVisible({ timeout: 30_000 })

    await page.getByPlaceholder("输入内容开始对话...").fill("请用一句话回复：共创体验验证")
    await page.getByRole("button", { name: "发送消息" }).click()

    await expect(page.getByText("积分不足")).not.toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/需要 52 积分，当前 48/)).not.toBeVisible()

    const bodyText = await page.locator("body").innerText()
    expect(bodyText).not.toContain("需要 52 积分，当前 48")
    expect(consoleErrors).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/TypeError|ReferenceError|Internal server error/i)]),
    )
  })
})
