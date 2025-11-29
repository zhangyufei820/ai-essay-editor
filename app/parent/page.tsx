import { Footer } from "@/components/footer"
import { ParentHero } from "@/components/parent/hero"
import { ParentFeatures } from "@/components/parent/features"
import { ParentInteraction } from "@/components/parent/interaction"
import { ParentGrowth } from "@/components/parent/growth"
import { ParentAI } from "@/components/parent/ai-learning"

export default function ParentPage() {
  return (
    <main className="min-h-screen">
      <ParentHero />
      <ParentFeatures />
      <ParentInteraction />
      <ParentGrowth />
      <ParentAI />
      <Footer />
    </main>
  )
}
