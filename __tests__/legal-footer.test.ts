import fs from "fs"
import path from "path"

const rootDir = path.resolve(__dirname, "..")

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8")
}

describe("Sprint 2C legal footer coverage", () => {
  const footerFiles = [
    "components/footer.tsx",
    "components/home/Footer.tsx",
    "components/home/HomeFooter.tsx",
  ]

  const legalPageFiles = [
    "app/privacy/page.tsx",
    "app/terms/page.tsx",
    "app/refund-policy/page.tsx",
  ]

  test.each(footerFiles)("%s should not contain placeholder links", (filePath) => {
    expect(readProjectFile(filePath)).not.toContain('href="#"')
  })

  test.each(footerFiles)("%s should expose core legal and commercial links", (filePath) => {
    const source = readProjectFile(filePath)

    expect(source).toContain("/privacy")
    expect(source).toContain("/terms")
    expect(source).toContain("/refund-policy")
    expect(source).toContain("/pricing")
    expect(source).toMatch(/\/help|mailto:support@shenxiang\.school/)
  })

  test.each(legalPageFiles)("%s should include the support email", (filePath) => {
    expect(readProjectFile(filePath)).toContain("support@shenxiang.school")
  })

  test("refund policy should request order and payment proof details", () => {
    const source = readProjectFile("app/refund-policy/page.tsx")

    expect(source).toContain("订单号")
    expect(source).toMatch(/支付凭证|支付时间/)
  })
})
