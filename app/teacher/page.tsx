import { Footer } from "@/components/footer"
import { TeacherHero } from "@/components/teacher/hero"
import { TeacherResources } from "@/components/teacher/resources"
import { TeacherDevelopment } from "@/components/teacher/development"
import { TeacherCommunity } from "@/components/teacher/community"

export default function TeacherPage() {
  return (
    <main className="min-h-screen">
      <TeacherHero />
      <TeacherResources />
      <TeacherDevelopment />
      <TeacherCommunity />
      <Footer />
    </main>
  )
}
