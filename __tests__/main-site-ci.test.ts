import fs from "fs"
import path from "path"

describe("main site CI release gate", () => {
  it("runs install, secret scan, lint, tests, critical coverage, and build", () => {
    const workflow = fs.readFileSync(path.join(process.cwd(), ".github/workflows/main-site-ci.yml"), "utf8")

    for (const command of [
      "npm ci",
      "npm run security:secrets",
      "npm run lint",
      "npm test -- --runInBand",
      "npm run test:coverage:critical",
      "npm run build",
    ]) {
      expect(workflow).toContain(command)
    }
    expect(workflow).toContain("services/shenxiang-new-api/**")
  })

  it("aligns React types and keeps production E2E opt-in", () => {
    const packageJson = fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    const playwrightConfig = fs.readFileSync(path.join(process.cwd(), "playwright.config.ts"), "utf8")

    expect(packageJson).toContain('"@types/react": "18.3.31"')
    expect(packageJson).toContain('"@types/react-dom": "18.3.7"')
    expect(playwrightConfig).toContain('defaultBaseURL = "http://127.0.0.1:3000"')
    expect(playwrightConfig).toContain('process.env.RUN_PRODUCTION_E2E === "1"')
    expect(playwrightConfig).toContain('hostname.endsWith(".shenxiang.school")')
    expect(fs.readFileSync(path.join(process.cwd(), "components/chat/gpt-image2-chat-interface.tsx"), "utf8"))
      .not.toMatch(/const supabase = createClient\(/)
  })

  it("uses the Next 16 proxy convention without custom image optimizer caching", () => {
    const proxy = fs.readFileSync(path.join(process.cwd(), "proxy.ts"), "utf8")
    const nextConfig = fs.readFileSync(path.join(process.cwd(), "next.config.mjs"), "utf8")

    expect(fs.existsSync(path.join(process.cwd(), "middleware.ts"))).toBe(false)
    expect(proxy).toContain("export async function proxy")
    expect(nextConfig).not.toContain("source: '/_next/image'")
  })
})
