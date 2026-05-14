import { PricingPageClient } from "@/components/pricing/PricingPageClient"

export const dynamic = "force-static"
export const revalidate = 300

export default function PricingPage() {
  return <PricingPageClient />
}
