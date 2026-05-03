import {
  PRODUCT_CATALOG,
  getCatalogCredits,
  getCatalogProduct,
  getCatalogPriceInCents,
  isCatalogMembershipProduct,
  isCatalogCreditsProduct,
  type MembershipTier,
  type ProductCatalogItem,
} from "@/lib/billing-config"
import {
  isSubscribedUser,
  resolveMembershipStatus,
  canUseImage2,
} from "@/lib/permissions"

export type Product = Omit<ProductCatalogItem, "credits">
export type { MembershipTier }
export { canUseImage2, isSubscribedUser, resolveMembershipStatus }
export const hasActiveMembership = isSubscribedUser

export const MEMBERSHIP_CREDITS: Record<string, number> = Object.fromEntries(
  PRODUCT_CATALOG
    .filter((product) => product.productType === "membership")
    .map((product) => [product.id, product.credits]),
)

export const PRODUCTS: Product[] = PRODUCT_CATALOG.map(({ credits, ...product }) => product)

export function getProductById(productId: string): ProductCatalogItem | undefined {
  return getCatalogProduct(productId)
}

export function getProductCredits(productId: string): number {
  return getCatalogCredits(productId)
}

export function getProductPriceInCents(productId: string, billing: string = "monthly"): number | null {
  return getCatalogPriceInCents(productId, billing)
}

export function requiresMembership(productId: string): boolean {
  return PRODUCT_CATALOG.find((product) => product.id === productId)?.requiresMembership === true
}

export function isCreditsProduct(productId: string): boolean {
  return isCatalogCreditsProduct(productId)
}

export function isMembershipProduct(productId: string): boolean {
  return isCatalogMembershipProduct(productId)
}

export function isPurchasableProduct(productId: string): boolean {
  const product = getCatalogProduct(productId)
  return Boolean(product && product.purchasable !== false && (product.productType === "membership" || product.productType === "credits"))
}

export function getAllowedMemberships(productId: string): MembershipTier[] {
  const product = getCatalogProduct(productId)
  if (!product?.requiresMembership) return []
  return product.allowedMemberships || ["basic", "pro", "premium", "enterprise", "campus"]
}

export function canPurchaseProductWithMembership(productId: string, membershipStatus: string | null): boolean {
  const product = getCatalogProduct(productId)
  if (!product || product.purchasable === false) return false
  if (!product.requiresMembership) return true
  if (!isSubscribedUser(membershipStatus)) return false
  return getAllowedMemberships(productId).includes(membershipStatus as MembershipTier)
}

export function validateProductPurchase(
  productId: string,
  membershipStatus: string | null,
): { ok: true; product: ProductCatalogItem } | { ok: false; error: string; status: number } {
  const product = getProductById(productId)
  if (!product) {
    return { ok: false, error: "产品不存在", status: 404 }
  }
  if (!isPurchasableProduct(productId)) {
    return { ok: false, error: "该产品暂不支持在线购买", status: 400 }
  }
  if (!canPurchaseProductWithMembership(productId, membershipStatus)) {
    return { ok: false, error: "当前会员等级无权购买该积分包", status: 403 }
  }
  return { ok: true, product }
}
