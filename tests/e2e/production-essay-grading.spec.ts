import { expect, test } from "@playwright/test"
import { readFile } from "node:fs/promises"
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

  const gradingResponse = page.waitForResponse(
    (response) => response.url().includes("/api/dify-chat") && response.request().method() === "POST",
    { timeout: 60_000 },
  )
  await page.getByRole("button", { name: "发送消息" }).click()

  await expect(page.getByText(/综合评分[:：]?\s*\d+|综合总分[:：]?\s*\d+/).last())
    .toBeVisible({ timeout: 240_000 })
  await expect(page.locator("article").last()).toContainText(/修改建议|修改理由|导师润色|升格建议/)
  await expect(page.locator("article").last()).toContainText(/种花|花苗|松土|浇水/)
  await expect(page.getByText("当前回复未完整送达")).toHaveCount(0)
  const response = await gradingResponse
  expect(response.ok()).toBe(true)
  expect(await response.text()).not.toMatch(/"essay_fallback_used"\s*:\s*true/)

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "导出 PDF" }).last().click()
  const download = await downloadPromise
  if (process.env.PDF_EXPORT_ARTIFACT_PATH) {
    await download.saveAs(process.env.PDF_EXPORT_ARTIFACT_PATH)
  }
  const pdf = (await readFile(await download.path())).toString("latin1")
  expect(pdf.startsWith("%PDF-")).toBe(true)
  const imageWidths = [...pdf.matchAll(/\/Width\s+(\d+)\s*\/Height\s+\d+/g)].map((match) => Number(match[1]))
  expect(Math.max(...imageWidths)).toBeGreaterThanOrEqual(2200)
  const imageHeights = [...pdf.matchAll(/\/Width\s+\d+\s*\/Height\s+(\d+)/g)].map((match) => Number(match[1]))
  expect(Math.max(...imageHeights)).toBeLessThan(4000)
})

test("recovers a completed grading report when the browser response is lost", async ({ page }) => {
  test.setTimeout(360_000)
  const { phone, password } = readE2eCredentials()
  test.skip(!password, "SHENXIANG_E2E_TEST_PASSWORD is not configured")

  await page.goto("/login?redirect=/chat/standard", { waitUntil: "domcontentloaded" })
  await page.getByRole("tab", { name: "Password" }).click({ timeout: 30_000 })
  await page.locator("#passworLogin_account").fill(phone, { timeout: 30_000 })
  await page.locator("#passworLogin_password").fill(password, { timeout: 30_000 })
  await page.locator("button[type='submit']").filter({ hasText: "Sign In" }).click()
  await page.waitForURL(/\/chat\/standard(?:$|\?)/, { timeout: 45_000 })

  let sessionId = ""
  await page.route("**/api/dify-chat", async (route) => {
    sessionId = route.request().postDataJSON().sessionId
    const response = await route.fetch({ timeout: 240_000 })
    expect(response.ok()).toBe(true)
    await route.abort("failed")
  })

  const essay = [
    "那本错题本一直放在书桌最下面的抽屉里。第一次月考后，老师要求我们整理错题，我把答案工整地抄了一遍，以为这样就算弄懂了。",
    "第二周的随堂测验又出现一道相似的题。我认出了熟悉的图形，提笔便写下上次记住的公式。试卷发回来，我才发现题目多了一个条件，而我连它都没有看清。",
    "放学路上，同桌问我为什么又在同一处失分。我说自己粗心，话一出口却觉得心虚。我从来没有想过公式究竟从哪里来，又在什么情况下才能使用。",
    "晚上，我终于翻开错题本。纸上只有题目、答案和一个红叉，错误原因一栏空着。我拿出草稿纸，从已知条件画起，试着不用答案重新推导。",
    "第二天，我带着草稿去问老师。老师让我解释每一步为什么成立。说到那个被我忽略的条件时，我终于能用自己的话讲清它的作用。",
    "此后每整理一道错题，我都会写下当时的想法，再找一题稍有变化的练习检验自己。错题本提醒我，认真面对不会的地方，比装作已经会了更需要勇气。",
  ].join("\n")
  await page.getByPlaceholder("输入内容开始对话...").fill(`请完整批改这篇作文，给出具体评分、优点和修改建议：\n${essay}`)
  await page.getByRole("button", { name: "发送消息" }).click()

  await expect(page.getByText(/综合评分[:：]?\s*\d+|综合总分[:：]?\s*\d+/).last())
    .toBeVisible({ timeout: 270_000 })
  await expect(page.getByText("当前回复未完整送达")).toHaveCount(0)
  expect(sessionId).toMatch(/^[0-9a-f-]{36}$/i)

  await page.goto(`/chat?sessionId=${encodeURIComponent(sessionId)}&agent=standard`, { waitUntil: "domcontentloaded" })
  await expect(page.getByText(/综合评分[:：]?\s*\d+|综合总分[:：]?\s*\d+/).last())
    .toBeVisible({ timeout: 30_000 })
})

test("completes an essay-related request through the general chat entry", async ({ page }) => {
  test.setTimeout(180_000)

  const { phone, password } = readE2eCredentials()
  test.skip(!password, "SHENXIANG_E2E_TEST_PASSWORD is not configured")

  await page.goto("/login?redirect=/chat/general-chat", { waitUntil: "domcontentloaded" })
  await page.getByRole("tab", { name: "Password" }).click({ timeout: 30_000 })
  await page.locator("#passworLogin_account").fill(phone, { timeout: 30_000 })
  await page.locator("#passworLogin_password").fill(password, { timeout: 30_000 })
  await page.locator("button[type='submit']").filter({ hasText: "Sign In" }).click()
  await page.waitForURL(/\/chat\/general-chat(?:$|\?)/, { timeout: 45_000 })

  await page.getByPlaceholder("输入内容开始对话...").fill(
    "我写了一篇关于校园种花的作文：周六早上，我和同学到校园种花。我们先松土，再放入花苗，最后浇水。看到整齐的花苗，我明白合作的重要。请告诉我应该如何使用本站作文批改功能，并给出两条具体修改方向。",
  )
  const chatResponse = page.waitForResponse(
    (response) => response.url().includes("/api/dify-chat") && response.request().method() === "POST",
    { timeout: 60_000 },
  )
  await page.getByRole("button", { name: "发送消息" }).click()
  const response = await chatResponse
  expect(response.ok()).toBe(true)
  expect(await response.text()).not.toContain("DIFY_UPSTREAM_UNAVAILABLE")
  await expect(page.locator("article").last()).toContainText(/作文|批改|修改/, { timeout: 120_000 })
  await expect(page.getByText("当前回复未完整送达")).toHaveCount(0)
})

test("completes a long essay through the writing skill route", async ({ page }) => {
  test.setTimeout(360_000)

  const { phone, password } = readE2eCredentials()
  test.skip(!password, "SHENXIANG_E2E_TEST_PASSWORD is not configured")

  await page.goto("/login?redirect=%2Fchat%3Fagent%3Dshenxiang-zuowen-shengge", { waitUntil: "domcontentloaded" })
  await page.getByRole("tab", { name: "Password" }).click({ timeout: 30_000 })
  await page.locator("#passworLogin_account").fill(phone, { timeout: 30_000 })
  await page.locator("#passworLogin_password").fill(password, { timeout: 30_000 })
  await page.locator("button[type='submit']").filter({ hasText: "Sign In" }).click()
  await page.waitForURL(/\/chat\?agent=shenxiang-zuowen-shengge/, { timeout: 45_000 })

  const essay = [
    "那本错题本一直放在书桌最下面的抽屉里。它的封面已经卷起了角，我每次收拾书包都会看见它，却总把它推回去。第一次月考后，老师要求我们整理错题，我把答案工整地抄了一遍，以为这样就算弄懂了。",
    "第二周的随堂测验又出现一道相似的题。我认出了熟悉的图形，心里一阵轻松，提笔便写下上次记住的公式。直到老师把卷子发回来，我才发现题目多了一个条件，而我连它都没有看清。",
    "放学路上，同桌问我为什么又在同一处失分。我随口说自己粗心，话一出口却觉得心虚。那不是一次偶然的笔误，而是我从来没有停下来想过：公式究竟从哪里来，又在什么情况下才能使用。",
    "晚上，我终于翻开错题本。纸上只有题目、答案和一个红色的叉，错误原因一栏空着。我拿出草稿纸，从已知条件画起，试着不用答案重新推导。算到第三步时，我发现自己把两个相似的概念混在了一起。",
    "我把这个发现写在旁边，又补上一个反例。原来那道题并不难，难的是承认自己先前并没有真正理解。写下这句话的时候，窗外的雨敲着玻璃，我第一次觉得错题本不只是记录分数的地方。",
    "第二天，我带着草稿去问老师。老师没有直接告诉我正确步骤，而是让我解释每一步为什么成立。说到那个被我忽略的条件时，我停了很久，终于能用自己的话讲清它的作用。",
    "此后每整理一道错题，我都会写下当时的想法，再找一题稍有变化的练习检验自己。有时仍会算错，但我能分辨是计算失误还是理解出了问题，也不再急着把红叉藏起来。",
    "一个周末，妹妹好奇地翻看我的错题本，指着满页的修改痕迹问我是不是考得很差。我原本想合上本子，后来还是告诉她，每个红叉都记录了我弄明白一个问题的过程。她听完也拿来自己的练习册，我们一起画图，把看不懂的题拆成几步。",
    "再次测验时，我遇到一道从未见过的变式题。心里仍然紧张，但我没有立刻寻找熟悉的公式，而是先圈出条件，再写下它们之间的关系。交卷前我检查了一遍推导，虽然不能确定每一步都对，却知道自己这次是在思考，不是在背答案。",
    "期末前，我重新读那本本子，发现最有用的不是密密麻麻的答案，而是那些被修改过的解释。它提醒我，认真面对不会的地方，比装作已经会了更需要勇气。",
  ].join("\n")
  const query = `请对下面这篇作文做具体的升格修改，指出结构和语言问题，并给出修改后的段落。\n${essay}`
  expect(query.length).toBeGreaterThan(800)

  await page.getByPlaceholder("输入内容开始对话...").fill(query)
  const chatResponse = page.waitForResponse(
    (response) => response.url().includes("/api/dify-chat") && response.request().method() === "POST",
    { timeout: 60_000 },
  )
  await page.getByRole("button", { name: "发送消息" }).click()
  const response = await chatResponse
  const requestBody = response.request().postDataJSON()
  expect(requestBody.workflowSkillId).toBe("shenxiang-zuowen-shengge")
  expect(response.ok()).toBe(true)
  expect(await response.text()).not.toContain("DIFY_UPSTREAM_UNAVAILABLE")
  await expect(page.locator("article").last()).toContainText(/修改|升格|结构|语言/, { timeout: 300_000 })
  await expect(page.getByText("当前回复未完整送达")).toHaveCount(0)
})

test("routes a long quoted argument essay to the selected writing skill", async ({ page }) => {
  test.setTimeout(360_000)
  const { phone, password } = readE2eCredentials()
  test.skip(!password, "SHENXIANG_E2E_TEST_PASSWORD is not configured")

  await page.goto("/login?redirect=%2Fchat%3Fagent%3Dshenxiang-gaozhong-lunshuowen", { waitUntil: "domcontentloaded" })
  await page.getByRole("tab", { name: "Password" }).click({ timeout: 30_000 })
  await page.locator("#passworLogin_account").fill(phone, { timeout: 30_000 })
  await page.locator("#passworLogin_password").fill(password, { timeout: 30_000 })
  await page.locator("button[type='submit']").filter({ hasText: "Sign In" }).click()
  await page.waitForURL(/\/chat\?agent=shenxiang-gaozhong-lunshuowen/, { timeout: 45_000 })

  const paragraph = "‘和’并非放弃原则，而是寻找共同生活的秩序。有人说‘退一步海阔天空’，但面对公共问题，仅仅退让并不能解决分歧。个人需要先辨明自己的立场，再听见他人的理由；社会需要通过制度容纳不同声音。"
  const essay = `《以和致和》\n${paragraph.repeat(9)}\n因此，和的价值在于让不同的人仍能共同面对现实。`
  expect(essay.length).toBeGreaterThan(800)
  await page.getByPlaceholder("输入内容开始对话...").fill(essay)
  const chatResponse = page.waitForResponse(
    (response) => response.url().includes("/api/dify-chat") && response.request().method() === "POST",
    { timeout: 60_000 },
  )
  await page.getByRole("button", { name: "发送消息" }).click()
  const response = await chatResponse
  expect(response.request().postDataJSON().workflowSkillId).toBe("shenxiang-gaozhong-lunshuowen")
  expect(response.ok()).toBe(true)
  const assistant = page.locator("article").last()
  await expect(assistant).toContainText(/论证|结构|升格|修改|建议/, { timeout: 300_000 })
  await expect(assistant).not.toContainText("你想先处理哪一类内容")
  expect((await assistant.innerText()).length).toBeGreaterThan(200)
  await expect(page.getByText("当前回复未完整送达")).toHaveCount(0)
})
