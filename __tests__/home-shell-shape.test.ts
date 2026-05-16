import fs from "fs"
import path from "path"

const root = process.cwd()

function read(relPath: string) {
  return fs.readFileSync(path.join(root, relPath), "utf8")
}

describe("home shell shape", () => {
  it("home page does not render the removed shell blocks", () => {
    const homePage = read("components/home/HomePageClient.tsx")
    const hero = read("components/home/HeroSection.tsx")

    expect(homePage).not.toContain("Header")
    expect(homePage).not.toContain("StatsSection")
    expect(homePage).not.toContain("CTASection")

    expect(hero).not.toContain("完整学习报告预览")
    expect(hero).not.toContain("从图片上传到修改稿，一屏读完")
    expect(hero).not.toContain("作文批改报告")
  })

  it("sidebar keeps the ae3e5c0 learning workspace routes", () => {
    const sidebar = read("components/app-sidebar.tsx")

    for (const href of ["/folder", "/teacher/agents", "/tools", "/explore", "/my/shares", "/dashboard", "/flashcards"]) {
      expect(sidebar).toContain(`href=\"${href}\"`)
    }

    for (const relPath of [
      "app/folder/page.tsx",
      "app/teacher/agents/page.tsx",
      "app/tools/page.tsx",
      "app/explore/page.tsx",
      "app/my/shares/page.tsx",
    ]) {
      expect(fs.existsSync(path.join(root, relPath))).toBe(true)
    }
  })
})
