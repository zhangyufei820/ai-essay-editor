import { HelpPageClient } from "@/components/help/HelpPageClient"

export const dynamic = "force-static"
export const revalidate = 300

export default function HelpPage() {
  return <HelpPageClient />
}
