import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8")
}

describe("operations-facing pages", () => {
  it("keeps error pages friendly and actionable", () => {
    const sources = [
      read("app/error.tsx"),
      read("app/global-error.tsx"),
      read("app/not-found.tsx"),
    ].join("\n")

    expect(sources).toContain("返回首页")
    expect(sources).toContain("联系客服")
    expect(sources).toContain("访问帮助页")
    expect(sources).not.toMatch(/stack|trace|password|service_role/i)
  })

  it("documents the health page troubleshooting flow", () => {
    const source = read("app/health/page.tsx")

    expect(source).toContain("健康检查")
    expect(source).toContain("/api/health")
    expect(source).toContain("支付回调")
    expect(source).toContain("Supabase")
    expect(source).toContain("不要把真实值")
  })

  it("serves local icon routes to avoid repeated browser icon 404s", () => {
    expect(read("app/favicon.ico/route.ts")).toContain('"/icon.svg"')
    expect(read("app/apple-icon.png/route.ts")).toContain('"/icon.svg"')
    expect(read("app/layout.tsx")).toContain('icon: "/favicon.ico"')
    expect(read("app/layout.tsx")).toContain('apple: "/apple-icon.png"')
  })

  it("keeps static marketing pages fully static for read-only production containers", () => {
    expect(read("app/page.tsx")).toContain("export const revalidate = false")
    expect(read("app/pricing/layout.tsx")).toContain("export const revalidate = false")
    expect(read("app/help/page.tsx")).toContain("export const revalidate = false")
  })
})
