import fs from "fs"
import path from "path"
import sitemap from "@/app/sitemap"
import { PRODUCTS, getProductPriceInCents } from "@/lib/products"

const rootDir = path.resolve(__dirname, "..")

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8")
}

describe("Sprint 6 growth conversion guardrails", () => {
  test("hero keeps concrete correction positioning and real CTA routes", () => {
    const source = readProjectFile("components/home/HeroSection.tsx")

    expect(source).toContain("上传作文批改")
    expect(source).toContain("智能体广场")
    expect(source).toMatch(/href:\s*["']\/agents["']/)
    expect(source).toMatch(/href:\s*["']\/chat\/standard["']/)
    expect(source).not.toContain('href="#"')
    expect(source).not.toContain("完整学习报告预览")
    expect(source).not.toContain("从图片上传到修改稿，一屏读完")
    expect(source).not.toContain("作文批改报告")
  })

  test("pricing copy matches product catalog amounts and membership rules", () => {
    const pricingSource = readProjectFile("components/pricing.tsx")
    const checkoutSource = readProjectFile("app/checkout/[productId]/page.tsx")

    for (const product of PRODUCTS) {
      const monthlyYuan = product.priceInCents / 100
      if (product.purchasable === false) {
        expect(getProductPriceInCents(product.id)).toBeNull()
        continue
      }
      expect(getProductPriceInCents(product.id)).toBe(product.priceInCents)

      if (product.productType === "membership") {
        expect(pricingSource).toContain("getCatalogPriceInCents(plan.id")
        expect(getProductPriceInCents(product.id, "annual")).toBe(Math.round(product.priceInCents * 12 * 0.8))
      }

      if (product.productType === "credits") {
        expect(pricingSource).toContain("{pack.credits} 积分")
        expect(product.requiresMembership).toBe(true)
      }
    }

    expect(pricingSource).toContain("订阅用户可买")
    expect(pricingSource).toContain("专业版及以上可买")
    expect(checkoutSource).toContain("年付已按月付 × 12 × 8 折计算")
    expect(checkoutSource).toContain("10,000 积分包豪华版及以上可买")
  })

  test("payment success page points users to credits, writing, and support", () => {
    const source = readProjectFile("app/payment/success/page.tsx")

    expect(source).toContain("下一步建议")
    expect(source).toContain("/settings")
    expect(source).toContain("/chat/standard")
    expect(source).toContain("mailto:support@shenxiang.school")
    expect(source).not.toContain('href="#"')
  })

  test("sitemap contains public pages but excludes private and payment-state routes", () => {
    const urls = sitemap().map((entry) => entry.url)
    const joined = urls.join("\n")

    expect(urls).toContain("https://shenxiang.school")
    expect(urls).toContain("https://shenxiang.school/pricing")
    expect(urls).toContain("https://shenxiang.school/refund-policy")

    expect(joined).not.toMatch(/\/admin\b/)
    expect(joined).not.toMatch(/\/login\b/)
    expect(joined).not.toMatch(/\/auth\b/)
    expect(joined).not.toMatch(/\/settings\b/)
    expect(joined).not.toMatch(/\/credits\b/)
    expect(joined).not.toMatch(/\/payment\b/)
    expect(joined).not.toMatch(/\/checkout\b/)
  })
})
