import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8")
}

describe("operations and monitoring docs", () => {
  it("contains the required operational commands and health checks", () => {
    const docs = [
      read("docs/OPERATIONS.md"),
      read("docs/MONITORING.md"),
      read("docs/RUNBOOK.md"),
    ].join("\n")

    expect(docs).toContain("npm run lint")
    expect(docs).toContain("npm run build")
    expect(docs).toContain("/api/health")
    expect(docs).toContain("/health")
    expect(docs).toContain("Sentry")
    expect(docs).toContain("不要把真实密钥写进文档或代码")
  })

  it("uses placeholders instead of obvious hard-coded secrets", () => {
    const docs = [
      read("docs/OPERATIONS.md"),
      read("docs/MONITORING.md"),
      read("docs/RUNBOOK.md"),
    ].join("\n")

    expect(docs).not.toMatch(/sk_(live|test)_[A-Za-z0-9]+/)
    expect(docs).not.toMatch(/postgres:\/\/[^`\s]+/)
    expect(docs).not.toMatch(/service_role\s*=\s*["'][^"']+["']/i)
  })
})
