'use client'

import { Pricing } from "@/components/pricing" // 复用你已有的组件
import { Footer } from "@/components/footer"
import { useEffect, useState } from "react"

export default function PricingPage() {
  const [currentSubscription, setCurrentSubscription] = useState<string | undefined>(undefined)

  useEffect(() => {
    const fetchMembership = async () => {
      try {
        const localUser = localStorage.getItem('currentUser')
        if (localUser) {
          const user = JSON.parse(localUser)
          const userId = user.id || user.sub || user.userId
          if (userId) {
            const res = await fetch(`/api/user/membership?user_id=${encodeURIComponent(userId)}`)
            if (res.ok) {
              const data = await res.json()
              // type 为 "免费" 时不传，让组件不显示任何订阅状态
              if (data.type && data.type !== "免费") {
                setCurrentSubscription(data.type)
              }
            }
          }
        }
      } catch (e) {
        console.error("获取会员状态失败:", e)
      }
    }
    fetchMembership()
  }, [])

  return (
    <main className="min-h-screen bg-gray-50">
      {/* 我们可以给顶部加一点留白，让它看起来不像直接贴在顶部的 */}
      <div className="pt-10">
        <Pricing currentSubscription={currentSubscription} />
      </div>
      <Footer />
    </main>
  )
}