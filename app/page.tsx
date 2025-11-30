import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { EducationHero } from "@/components/education/hero"
import { GradeLevels } from "@/components/education/grade-levels"
import { SubjectCategories } from "@/components/education/subject-categories"
import { TeacherSection } from "@/components/education/teacher-section"
import { Features } from "@/components/education/features"
import { Stats } from "@/components/education/stats"

export default function Home() {
  return (
    <main className="min-h-screen">
      <Header />
      <EducationHero />
      <Stats />
      <GradeLevels />
      <SubjectCategories />
      <TeacherSection />
      <Features />
      <Footer />
    </main>
  )
}
