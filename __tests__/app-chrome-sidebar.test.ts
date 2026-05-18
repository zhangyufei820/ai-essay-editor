import { buildSidebarSections } from "@/components/app-chrome"

describe("app chrome sidebar", () => {
  it("surfaces Tripo3D inside the AI chat workspace sidebar", () => {
    const items = buildSidebarSections().flatMap((section) => section.items)

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Tripo3D 模型生成",
          href: "/tools/tripo3d",
          badge: "3D",
        }),
      ])
    )
  })
})
