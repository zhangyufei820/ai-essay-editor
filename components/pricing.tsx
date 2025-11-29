"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"

const subscriptionPlans = [
  {
    id: "basic",
    name: "基础版",
    description: "适合入门体验",
    monthlyPrice: 28,
    annualPrice: 268.8,
    credits: 2000,
    essaysPerMonth: 8,
    features: [
      { text: "每月 2,000 积分", highlight: true },
      { text: "(约可修改 8 篇作文)", subtext: true },
      { text: "调用所有 AI 模型" },
      { text: "标准生成速度" },
      { text: "社区支持" },
      { text: "调用专业智能体" },
    ],
    popular: false,
  },
  {
    id: "pro",
    name: "专业版",
    description: "适合高频学生",
    monthlyPrice: 68,
    annualPrice: 652.8,
    credits: 5000,
    essaysPerMonth: 20,
    features: [
      { text: "每月 5,000 积分", highlight: true },
      { text: "(约可修改 20 篇作文)", subtext: true },
      { text: "调用所有 AI 模型" },
      { text: "优先生成速度", highlight: true },
      { text: "高级润色工具", highlight: true },
      { text: "名师辅导 (1次/月)", highlight: true },
      { text: "调用专业智能体", highlight: true },
    ],
    popular: true,
  },
  {
    id: "premium",
    name: "豪华版",
    description: "适合重度用户/教育者",
    monthlyPrice: 128,
    annualPrice: 1228.8,
    credits: 12000,
    essaysPerMonth: 50,
    features: [
      { text: "每月 12,000 积分", highlight: true },
      { text: "(约可修改 50 篇作文)", subtext: true },
      { text: "调用三大顶尖模型 (Claude, Gemini, ChatGPT)", highlight: true },
      { text: "最高优先速度", highlight: true },
      { text: "高级润色工具" },
      { text: "名师辅导 (2次/月)", highlight: true },
      { text: "无限次 AI 对话", highlight: true },
      { text: "调用专业智能体", highlight: true },
    ],
    popular: false,
  },
]

const creditPacks = [
  { credits: 500, price: 5, discount: null },
  { credits: 1000, price: 10, discount: null },
  { credits: 5000, price: 48, discount: "96折" },
  { credits: 10000, price: 90, discount: "9折" },
]

export function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const router = useRouter()

  const handlePlanSelect = (planId: string) => {
    setSelectedPlan(planId)
    // Use productId format that matches [productId]/page.tsx route
    router.push(`/checkout/${planId}?billing=${isAnnual ? "annual" : "monthly"}`)
  }

  const handleCreditPurchase = (credits: number, price: number) => {
    router.push(`/checkout/credits-${credits}?price=${price}`)
  }

  return (
    <section id="pricing" className="py-16 md:py-24 bg-gradient-to-b from-gray-50 to-white">
      <div className="container px-4 mx-auto max-w-7xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">选择最适合您的方案</h2>
          <p className="text-lg text-gray-600 mb-8">
            我们提供灵活的积分制，您可以根据需求选择最划算的订阅或一次性购买积分包。
          </p>

          <div className="flex items-center justify-center gap-4">
            <span className={`text-lg font-medium ${!isAnnual ? "text-primary font-bold" : "text-gray-700"}`}>
              月付
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className="relative inline-block w-14 h-8 rounded-full transition-colors duration-200"
              style={{ backgroundColor: isAnnual ? "oklch(0.35 0.08 150)" : "#d1d5db" }}
            >
              <div
                className="absolute left-1 top-1 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200"
                style={{ transform: isAnnual ? "translateX(24px)" : "translateX(0)" }}
              />
            </button>
            <span className={`text-lg font-medium ${isAnnual ? "text-primary font-bold" : "text-gray-700"}`}>
              年付
              <span className="ml-1 bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                立享 20% 折扣
              </span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {subscriptionPlans.map((plan) => (
            <Card
              key={plan.id}
              className={`relative flex flex-col transition-all duration-300 cursor-pointer rounded-2xl overflow-visible bg-white ${
                plan.popular
                  ? "border-2 border-primary shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_12px_40px_rgb(0,0,0,0.15)]"
                  : "border-2 border-gray-200 shadow-[0_4px_20px_rgb(0,0,0,0.08)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)]"
              } ${selectedPlan === plan.id ? "ring-4 ring-primary/20 ring-offset-2 scale-105" : "hover:scale-105"}`}
              onClick={() => handlePlanSelect(plan.id)}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                  <Badge className="bg-primary text-white px-6 py-1.5 text-sm font-semibold shadow-lg rounded-full">
                    最受欢迎
                  </Badge>
                </div>
              )}

              <CardContent className="p-8 flex flex-col flex-grow">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                <p className="text-gray-600 mb-6 text-sm">{plan.description}</p>

                <div className="mb-6">
                  <span className="text-5xl font-extrabold text-gray-900">
                    {isAnnual ? plan.annualPrice : plan.monthlyPrice}
                  </span>
                  <span className="text-lg font-medium text-gray-600">{isAnnual ? " 元/年" : " 元/月"}</span>
                </div>

                {isAnnual && (
                  <p className="text-green-600 font-medium h-6 mb-4 text-sm">
                    (折合 {(plan.annualPrice / 12).toFixed(1)} 元/月)
                  </p>
                )}

                <ul className="space-y-3 text-gray-700 mb-8 flex-grow">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className={`flex items-start ${feature.subtext ? "pl-7 text-sm text-gray-500" : ""}`}>
                      {!feature.subtext && <Check className="w-5 h-5 text-primary mr-3 flex-shrink-0 mt-0.5" />}
                      <span className={feature.highlight ? "font-semibold text-gray-900" : ""}>{feature.text}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={`w-full rounded-xl py-6 text-base font-semibold transition-all ${
                    plan.popular
                      ? "bg-primary hover:bg-primary/90 text-white shadow-lg hover:shadow-xl"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-800 shadow-md hover:shadow-lg"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    handlePlanSelect(plan.id)
                  }}
                >
                  选择{plan.name}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">积分充值包 (单次付费)</h2>
          <p className="text-center text-gray-600 mb-8">
            适合轻度或测试用户。购买的积分<span className="font-bold text-primary">永久有效</span>
            ，可用于生成作文或兑换名师辅导。
          </p>

          <Card className="overflow-hidden rounded-2xl border-2 border-gray-200 shadow-[0_4px_20px_rgb(0,0,0,0.08)]">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-sm font-bold text-gray-700">积分包</th>
                    <th className="px-6 py-4 text-sm font-bold text-gray-700">价格</th>
                    <th className="px-6 py-4 text-sm font-bold text-gray-700">优惠</th>
                    <th className="px-6 py-4 text-sm font-bold text-gray-700 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {creditPacks.map((pack) => (
                    <tr key={pack.credits} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-5 font-semibold text-gray-900">{pack.credits} 积分</td>
                      <td className="px-6 py-5 text-gray-800 font-medium">{pack.price} 元</td>
                      <td className="px-6 py-5">
                        {pack.discount ? (
                          <span className="text-green-600 font-bold bg-green-50 px-3 py-1 rounded-full text-sm">
                            {pack.discount}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <Button
                          size="sm"
                          className="bg-primary/10 hover:bg-primary/20 text-primary border-2 border-primary/30 hover:border-primary/50 font-semibold rounded-lg px-6 shadow-sm hover:shadow-md transition-all"
                          onClick={() => handleCreditPurchase(pack.credits, pack.price)}
                        >
                          购买
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="max-w-4xl mx-auto mt-16 p-8 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border-2 border-gray-200 shadow-[0_4px_20px_rgb(0,0,0,0.08)]">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">积分消耗说明 (FAQ)</h3>
          <p className="text-gray-700 leading-relaxed mb-6">
            <span className="font-bold text-gray-900">问：积分是如何消耗的？</span>
            <br />
            答：您的每一次操作都会消耗积分。我们的系统会智能调用 Gemini、Claude、GPT
            三个模型以确保最佳输出质量。积分可用于 AI 服务或兑换增值服务。
          </p>
          <ul className="space-y-3 text-gray-700">
            <li className="flex items-start">
              <Check className="w-5 h-5 text-primary mr-3 flex-shrink-0 mt-0.5" />
              <span>
                <span className="font-bold text-gray-900">生成一篇作文 (约800字):</span> 消耗约{" "}
                <span className="font-bold text-primary">240 积分</span>
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-primary mr-3 flex-shrink-0 mt-0.5" />
              <span>
                <span className="font-bold text-gray-900">AI 润色 (单次):</span> 消耗约{" "}
                <span className="font-bold text-primary">70 积分</span>
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-primary mr-3 flex-shrink-0 mt-0.5" />
              <span>
                <span className="font-bold text-gray-900">语法检查:</span> 消耗约{" "}
                <span className="font-bold text-primary">25 积分</span>
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-primary mr-3 flex-shrink-0 mt-0.5" />
              <span>
                <span className="font-bold text-gray-900">兑换名师辅导 (1次):</span> 消耗{" "}
                <span className="font-bold text-primary">1000 积分</span> (专业版/豪华版包含免费次数)
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
