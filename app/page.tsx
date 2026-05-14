import { HomePageClient } from "@/components/home/HomePageClient"

export const dynamic = "force-static"
export const revalidate = 300

export default function Home() {
  return <HomePageClient />
}
