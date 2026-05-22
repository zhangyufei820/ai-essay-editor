import { HelpPageClient } from "@/components/help/HelpPageClient"

export const dynamic = "force-static"
export const revalidate = false

export default function HelpPage() {
  return <HelpPageClient />
}
