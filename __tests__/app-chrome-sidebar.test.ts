import { buildSidebarSections } from "@/components/app-chrome"
import { CELLFORGE_EXTERNAL_URL } from "@/lib/tripo3d"
import { readFileSync } from "fs"
import path from "path"

describe("app chrome sidebar", () => {
  it("surfaces the CellForge 3D workspace inside the AI chat workspace sidebar", () => {
    const items = buildSidebarSections().flatMap((section) => section.items)

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "3D 细胞工作台",
          href: CELLFORGE_EXTERNAL_URL,
          badge: "3D",
        }),
      ])
    )
  })

  it("opens an app launcher from the new chat CTA", () => {
    const sidebar = readFileSync(path.join(process.cwd(), "components/v2-chrome/WorkspaceSidebar.tsx"), "utf8")

    expect(sidebar).toContain("appLauncherOpen")
    expect(sidebar).toContain("aria-expanded={appLauncherOpen}")
    expect(sidebar).toContain("选择应用开始")
    expect(sidebar).toContain("workspace-app-launcher")
  })
})
