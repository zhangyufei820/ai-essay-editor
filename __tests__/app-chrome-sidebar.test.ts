import { buildSidebarSections } from "@/components/app-chrome"
import { TRIPO3D_EXTERNAL_URL } from "@/lib/tripo3d"

describe("app chrome sidebar", () => {
  it("surfaces Tripo3D inside the AI chat workspace sidebar", () => {
    const items = buildSidebarSections().flatMap((section) => section.items)

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Tripo3D 模型生成",
          href: TRIPO3D_EXTERNAL_URL,
          badge: "3D",
        }),
      ])
    )
  })
})
