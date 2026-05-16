import fs from "fs"
import path from "path"

const root = path.resolve(__dirname, "..")

describe("home motion", () => {
  it("home sections do not use infinite-repeat animations", () => {
    const files = [
      "CTASection",
      "HeroSection",
      "CapabilitiesSection",
      "ProcessSection",
      "TestimonialsSection",
      "StatsSection",
      "StatsSectionAnimated",
      "HomeFooter",
      "OpenClawSection",
    ]

    for (const f of files) {
      const src = fs.readFileSync(path.join(root, "components/home", `${f}.tsx`), "utf8")
      expect(src).not.toMatch(/repeat:\s*Infinity/)
    }
  })
})
