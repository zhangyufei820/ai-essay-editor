import { defineConfig, devices } from "@playwright/test"

const productionBaseURL = "https://shenxiang.school"
const defaultBaseURL = "http://127.0.0.1:3000"
const configuredBaseURL = process.env.E2E_BASE_URL
const isProductionBaseURL = (value?: string) => {
  if (!value) return false
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === "shenxiang.school" || hostname.endsWith(".shenxiang.school")
  } catch {
    return false
  }
}
const baseURL = process.env.RUN_PRODUCTION_E2E === "1"
  ? configuredBaseURL || productionBaseURL
  : configuredBaseURL && !isProductionBaseURL(configuredBaseURL)
    ? configuredBaseURL
    : defaultBaseURL

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
