import { CapabilitiesSection } from "@/components/home/CapabilitiesSection"
import { CTASection } from "@/components/home/CTASection"
import { HeroSection } from "@/components/home/HeroSection"
import { HomeFooter } from "@/components/home/HomeFooter"
import { ProcessSection } from "@/components/home/ProcessSection"
import { StatsSection } from "@/components/home/StatsSection"
import { TestimonialsSection } from "@/components/home/TestimonialsSection"

export const dynamic = "force-static"
export const revalidate = 300

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--color-surface-soft)]">
      <HeroSection />
      {/* <TrustStrip /> */}
      <StatsSection />
      <CapabilitiesSection />
      <ProcessSection />
      <TestimonialsSection />
      <CTASection />
      <HomeFooter />
    </main>
  )
}
