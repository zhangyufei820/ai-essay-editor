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
          label: "三维细胞实验室",
          href: CELLFORGE_EXTERNAL_URL,
          badge: "三维",
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

  it("uses explicit router navigation for internal sidebar links", () => {
    const sidebar = readFileSync(path.join(process.cwd(), "components/v2-chrome/WorkspaceSidebar.tsx"), "utf8")

    expect(sidebar).toContain("const router = useRouter()")
    expect(sidebar).toContain("handleInternalNavigation")
    expect(sidebar).toContain("event?.preventDefault()")
    expect(sidebar).toContain("router.push(href)")
  })
})
