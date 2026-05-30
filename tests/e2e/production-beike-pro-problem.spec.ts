import { expect, test, type Page } from "@playwright/test"
import { readE2eCredentials } from "./e2e-secrets"

test.use({ screenshot: "off", trace: "off", video: "off" })

async function dismissTrialDialog(page: Page) {
  const trialDialog = page.getByRole("dialog", { name: "沈翔智学 60 天共创体验计划" })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(await trialDialog.isVisible({ timeout: 2_000 }).catch(() => false))) return
    const laterButton = trialDialog.getByRole("button", { name: "稍后再说" })
    if (await laterButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await laterButton.click({ force: true })
    } else {
      await page.keyboard.press("Escape")
    }
    if (await trialDialog.isHidden({ timeout: 3_000 }).catch(() => false)) return
  }
  throw new Error("trial_dialog_still_visible")
}

async function login(page: Page) {
  const { phone, password } = readE2eCredentials()
  test.skip(!password, "SHENXIANG_E2E_TEST_PASSWORD is not configured")

  await page.goto("/login?redirect=/chat", { waitUntil: "domcontentloaded" })
  await dismissTrialDialog(page)
  await page.locator("#passworLogin_account").fill(phone)
  await page.locator("#passworLogin_password").fill(password)
  await page.locator("button[type='submit']").filter({ hasText: "Sign In" }).click()
  await page.waitForURL(/\/chat(?:$|\?)/, { timeout: 45_000 })
  await page.locator("#passworLogin_password").fill("").catch(() => {})
  await dismissTrialDialog(page)
  await expect(page.getByPlaceholder("输入内容开始对话...")).toBeVisible({ timeout: 30_000 })
}

async function openChatModel(page: Page, modelPath: "/chat/beike-pro" | "/chat/problem") {
  await page.goto(modelPath, { waitUntil: "domcontentloaded" })
  await dismissTrialDialog(page)
  await expect(page.getByPlaceholder("输入内容开始对话...")).toBeVisible({ timeout: 30_000 })
}

async function sendChatMessage(page: Page, message: string) {
  await dismissTrialDialog(page)
  const input = page.getByPlaceholder("输入内容开始对话...")
  await input.fill(message)
  await expect(page.getByRole("button", { name: "发送消息" })).toBeEnabled()
  await page.getByRole("button", { name: "发送消息" }).click()
  await dismissTrialDialog(page)
}

async function waitForAssistantDone(page: Page, marker: RegExp | string) {
  await expect(page.getByText(marker).last()).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText("AI 正在组织回复...")).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByText("生成中...")).toHaveCount(0, { timeout: 30_000 })
}

async function waitForProblemActions(page: Page) {
  await expect(page.getByRole("button", { name: "加入错题本" }).last()).toBeVisible({ timeout: 150_000 })
  await expect(page.getByRole("button", { name: "举一反三" }).last()).toBeVisible()
  await expect(page.getByText("AI 正在组织回复...")).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByText("生成中...")).toHaveCount(0, { timeout: 30_000 })
}

test.describe("production beike-pro and problem chat", () => {
  test.setTimeout(180_000)

  test("beike-pro hides teacher-kit control payloads and completes normally", async ({ page }) => {
    await login(page)
    await openChatModel(page, "/chat/beike-pro")
    await sendChatMessage(
      page,
      "用teacher-kit-v4技能备课，请用一句话确认你会直接生成练习包，不要返回JSON。",
    )

    await waitForAssistantDone(page, /练习包|teacher-kit|备课|生成/)
    const bodyText = await page.locator("body").innerText()

    expect(bodyText).not.toContain('"skill"')
    expect(bodyText).not.toContain('"message"')
    expect(bodyText).not.toContain("skill_selected: teacher-kit-v4")
    expect(bodyText).not.toContain("连接中断")
    expect(bodyText).not.toContain("我没有收到可展示的回复")
  })

  test("problem chat exposes photo, mistake-book, and similar-practice actions", async ({ page }) => {
    const mistakeResponses: Array<{ status: number; body: unknown }> = []
    page.on("response", async (response) => {
      if (new URL(response.url()).pathname !== "/api/mistakes") return
      mistakeResponses.push({
        status: response.status(),
        body: await response.json().catch(() => null),
      })
    })

    await login(page)
    await openChatModel(page, "/chat/problem")
    await expect(page.getByLabel("拍照上传").first()).toBeVisible({ timeout: 15_000 })
    await sendChatMessage(page, "请解析这道题并给出举一反三练习：2x+3=11。")

    await waitForProblemActions(page)

    await page.getByRole("button", { name: "举一反三" }).last().click()
    await expect(page.getByPlaceholder("输入内容开始对话...")).toContainText("请基于下面这道题生成 5 道举一反三练习。")

    await page.getByRole("button", { name: "加入错题本" }).last().click()
    await expect(page.getByText(/已加入错题本|这道题已在错题本中/)).toBeVisible({ timeout: 20_000 })

    await expect.poll(() => mistakeResponses.length, { timeout: 20_000 }).toBeGreaterThan(0)
    expect(mistakeResponses.at(-1)?.status).toBe(200)
  })
})
