import { EssayGrader } from "@/components/essay-grader"
import { Header } from "@/components/header"

export default function EssayPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <EssayGrader />
      </div>
    </main>
  )
}
