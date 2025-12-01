'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Footer } from "@/components/footer"
import { EducationHero } from "@/components/education/hero"
import { GradeLevels } from "@/components/education/grade-levels"
import { SubjectCategories } from "@/components/education/subject-categories"
import { TeacherSection } from "@/components/education/teacher-section"
import { Features } from "@/components/education/features"
import { Stats } from "@/components/education/stats"
import { Pricing } from "@/components/pricing"

export default function Home() {
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    // 检查是否登录
    const user = localStorage.getItem('currentUser')
    
    if (!user) {
      // 没登录 -> 踢到 Authing 登录页
      router.replace('/login')
    } else {
      // 登录了 -> 显示正常的网站内容
      setIsAuthorized(true)
    }
  }, [router])

  if (!isAuthorized) {
    return null 
  }

  // 这里的 EducationHero 显示的是"智能教育平台"的大字，绝对不是登录框
  return (
    <main className="min-h-screen">
      <EducationHero />
      <Stats />
      <GradeLevels />
      <SubjectCategories />
      <TeacherSection />
      <Features />
      <Pricing />
      <Footer />
    </main>
  )
}