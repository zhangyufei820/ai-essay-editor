import { buildSidebarSections } from "@/components/app-chrome"
import { CELLFORGE_EXTERNAL_URL } from "@/lib/tripo3d"

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
})
