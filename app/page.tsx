import { HomePageClient } from "@/components/home/HomePageClient"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default function Home() {
  return <HomePageClient />
}
