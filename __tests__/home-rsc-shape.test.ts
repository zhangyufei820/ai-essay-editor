import fs from "fs"
import path from "path"

const root = path.resolve(__dirname, "..")

describe("home RSC shape", () => {
  it("app/page.tsx 是服务端组件且未声明 use client", () => {
    const src = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8")
    expect(src).not.toMatch(/^['"]use client['"]/m)
    expect(src).toContain('export const dynamic = "force-static"')
  })

  it("HeroSection / CapabilitiesSection 不再 use client", () => {
    for (const f of [
      "HeroSection",
      "CapabilitiesSection",
      "ProcessSection",
      "TestimonialsSection",
      "HomeFooter",
    ]) {
      const src = fs.readFileSync(path.join(root, "components/home", `${f}.tsx`), "utf8")
      expect(src).not.toMatch(/^['"]use client['"]/m)
    }
  })
})
