"use client"

import {
  BadgeV2 as Badge,
  ButtonV2 as Button,
  CardV2 as Card,
  CardV2Content as CardContent
} from "@/components/ui/v2"
import { Check } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { PRODUCT_CATALOG, getCatalogPriceInCents } from "@/lib/billing-config"

const subscriptionPlans = PRODUCT_CATALOG.filter((product) => product.productType === "membership")
const creditPacks = PRODUCT_CATALOG.filter((product) => product.productType === "credits")

function getCreditPackAccessText(productId: string): string {
  if (productId === "credits-500" || productId === "credits-1000") return "订阅用户可买"
  if (productId === "credits-5000") return "专业版及以上可买"
  if (productId === "credits-10000") return "豪华版及以上可买"
  return "按账户权限购买"
}

export function Pricing({ currentSubscription }: { currentSubscription?: string }) {
  const [isAnnual, setIsAnnual] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const router = useRouter()

  const handlePlanSelect = (planId: string) => {
    // 如果已经是订阅用户选择的方案，不跳转
    if (planId === currentSubscription) return
    setSelectedPlan(planId)
    // Use productId format that matches [productId]/page.tsx route
    router.push(`/checkout/${planId}?billing=${isAnnual ? "annual" : "monthly"}`)
  }

  const isSubscribedPlan = (planId: string) => Boolean(currentSubscription && planId === currentSubscription)

  const handleCreditPurchase = (productId: string) => {
    router.push(`/checkout/${productId}`)
  }

  return (
    <section id="pricing" className="py-16 md:py-24 bg-gradient-to-b from-gray-50 to-white">
      <div className="container px-4 mx-auto max-w-7xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-[var(--ink-900)] mb-4">选择最适合您的方案</h2>
          <p className="text-lg text-[var(--ink-600)] mb-3">
            先用积分体验作文批改和 AI 对话，高频使用再开通会员套餐。所有金额与结账页保持一致。
          </p>
          <p className="text-sm text-[var(--ink-500)] mb-8">
            年付为月付 × 12 × 8 折；企业版 / 校园版请联系商务。支付成功后可在账户权益页查看到账情况。
          </p>

          <div className="flex items-center justify-center gap-4">
            <span className={`text-lg font-medium ${!isAnnual ? "text-[var(--ink-700)] font-bold" : "text-[var(--ink-700)]"}`}>
              月付
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              aria-label={isAnnual ? "切换到月付" : "切换到年付"}
              aria-pressed={isAnnual}
              className="relative inline-block w-14 h-8 rounded-full transition-colors duration-200"
              style={{ backgroundColor: isAnnual ? "oklch(0.35 0.08 150)" : "#d1d5db" }}
            >
              <div
                className="absolute left-1 top-1 w-6 h-6 bg-[var(--paper-50)] rounded-full shadow transition-transform duration-200"
                style={{ transform: isAnnual ? "translateX(24px)" : "translateX(0)" }}
              />
            </button>
            <span className={`text-lg font-medium ${isAnnual ? "text-[var(--ink-700)] font-bold" : "text-[var(--ink-700)]"}`}>
              年付
              <span className="ml-1 bg-[var(--ink-100)] text-[var(--ink-700)] text-xs font-bold px-2 py-0.5 rounded-full">
                立享 20% 折扣
              </span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {subscriptionPlans.map((plan) => {
            const isCurrentPlan = isSubscribedPlan(plan.id)
            return (
            <Card
              key={plan.id}
              className={`relative flex flex-col transition-all duration-300 rounded-[var(--radius-sharp)] overflow-visible bg-[var(--paper-50)] ${
                isCurrentPlan
                  ? "border-2 border-gray-300 shadow-[0_4px_20px_rgb(0,0,0,0.08)] opacity-60"
                  : plan.popular
                  ? "border-2 border-[var(--ink-500)] shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_12px_40px_rgb(0,0,0,0.15)]"
                  : "border-2 border-[var(--paper-200)] shadow-[0_4px_20px_rgb(0,0,0,0.08)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)]"
              } ${!isCurrentPlan && selectedPlan === plan.id ? "ring-4 ring-[var(--ink-200)] ring-offset-2 scale-105" : ""} ${!isCurrentPlan ? "cursor-pointer hover:scale-105" : "cursor-default"}`}
              onClick={() => handlePlanSelect(plan.id)}
            >
              {plan.popular && !isCurrentPlan && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                  <Badge className="bg-[var(--seal-500)] text-white px-6 py-1.5 text-sm font-semibold shadow-lg rounded-full">
                    最受欢迎
                  </Badge>
                </div>
              )}

              {isCurrentPlan && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                  <Badge className="bg-[var(--seal-500)] text-white px-6 py-1.5 text-sm font-semibold shadow-lg rounded-full">
                    当前方案
                  </Badge>
                </div>
              )}

              <CardContent className="p-8 flex flex-col flex-grow">
                <h3 className={`text-2xl font-bold mb-2 ${isCurrentPlan ? "text-[var(--ink-500)]" : "text-[var(--ink-900)]"}`}>{plan.name}</h3>
                <p className={`mb-6 text-sm ${isCurrentPlan ? "text-[var(--ink-400)]" : "text-[var(--ink-600)]"}`}>{plan.description}</p>

                <div className="mb-6">
                  <span className={`text-5xl font-extrabold ${isCurrentPlan ? "text-[var(--ink-400)]" : "text-[var(--ink-900)]"}`}>
                    {((getCatalogPriceInCents(plan.id, isAnnual ? "annual" : "monthly") || 0) / 100).toFixed(isAnnual ? 1 : 0)}
                  </span>
                  <span className={`text-lg font-medium ${isCurrentPlan ? "text-[var(--ink-400)]" : "text-[var(--ink-600)]"}`}>{isAnnual ? " 元/年" : " 元/月"}</span>
                </div>

                {isAnnual && !isCurrentPlan && (
                  <p className="text-[var(--ink-600)] font-medium h-6 mb-4 text-sm">
                    (折合 {(((getCatalogPriceInCents(plan.id, "annual") || 0) / 100) / 12).toFixed(1)} 元/月)
                  </p>
                )}

                <ul className={`space-y-3 mb-8 flex-grow ${isCurrentPlan ? "text-[var(--ink-400)]" : "text-[var(--ink-700)]"}`}>
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start">
                      <Check className={`w-5 h-5 mr-3 flex-shrink-0 mt-0.5 ${isCurrentPlan ? "text-[var(--ink-400)]" : "text-[var(--ink-700)]"}`} />
                      <span className={idx === 0 ? "font-semibold" : ""}>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  disabled={isCurrentPlan}
                  className={`w-full rounded-[var(--radius-sharp)] py-6 text-base font-semibold transition-all ${
                    isCurrentPlan
                      ? "bg-[var(--paper-200)] text-[var(--ink-500)] cursor-default"
                      : plan.popular
                      ? "bg-[var(--seal-500)] hover:bg-[var(--ink-700)]/90 text-white shadow-lg hover:shadow-xl"
                      : "bg-[var(--paper-100)] hover:bg-[var(--paper-200)] text-[var(--ink-800)] shadow-md hover:shadow-lg"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    handlePlanSelect(plan.id)
                  }}
                >
                  {isCurrentPlan ? "当前方案" : `选择${plan.name}`}
                </Button>
              </CardContent>
            </Card>
          )})}
        </div>

        {/* 企业版/校园版入口卡片 */}
        <div className="max-w-4xl mx-auto mt-12">
          <Card className="relative overflow-hidden rounded-[var(--radius-sharp)] border-2 border-gray-800 bg-gradient-to-br from-gray-900 to-gray-800 shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_12px_40px_rgb(0,0,0,0.15)] transition-all duration-300">
            <CardContent className="p-8 md:p-10">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="text-center md:text-left flex-1">
                  <h3 className="text-3xl font-bold text-white mb-3">企业版 / 校园版</h3>
                  <p className="text-gray-300 text-lg mb-6">为学校和教育机构定制</p>
                  
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="flex items-center gap-2">
                      <Check className="w-5 h-5 text-green-400" />
                      <span className="text-gray-200">批量账号</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-5 h-5 text-green-400" />
                      <span className="text-gray-200">管理后台</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-5 h-5 text-green-400" />
                      <span className="text-gray-200">专属客服</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-5 h-5 text-green-400" />
                      <span className="text-gray-200">定制功能</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col items-center md:items-end gap-4">
                  <div className="text-center md:text-right">
                    <p className="text-[var(--ink-400)] text-sm mb-1">定制方案</p>
                    <p className="text-white text-2xl font-bold">按需定价</p>
                  </div>
                  
                  <Button 
                    className="bg-[var(--paper-50)] hover:bg-[var(--paper-100)] text-[var(--ink-900)] font-semibold px-8 py-6 rounded-[var(--radius-sharp)] transition-all duration-300 hover:scale-105"
                    onClick={() => window.location.href = '/help'}
                  >
                    联系商务
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-[var(--ink-900)] mb-4">积分充值包 (单次付费)</h2>
          <p className="text-center text-[var(--ink-600)] mb-8">
            适合会员加购。购买的积分<span className="font-bold text-[var(--ink-700)]">永久有效</span>
            ，不同积分包按会员等级开放，可用于文本生成、图片生成和音乐创作等积分服务。
          </p>

          <Card className="overflow-hidden rounded-[var(--radius-sharp)] border-2 border-[var(--paper-200)] shadow-[0_4px_20px_rgb(0,0,0,0.08)]">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-[var(--paper-200)]">
                  <tr>
                    <th className="px-6 py-4 text-sm font-bold text-[var(--ink-700)]">积分包</th>
                    <th className="px-6 py-4 text-sm font-bold text-[var(--ink-700)]">价格</th>
                    <th className="px-6 py-4 text-sm font-bold text-[var(--ink-700)]">购买条件</th>
                    <th className="px-6 py-4 text-sm font-bold text-[var(--ink-700)] text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {creditPacks.map((pack) => (
                    <tr key={pack.id} className="hover:bg-[var(--paper-50)] transition-colors">
                      <td className="px-6 py-5 font-semibold text-[var(--ink-900)]">{pack.credits} 积分</td>
                      <td className="px-6 py-5 text-[var(--ink-800)] font-medium">{((getCatalogPriceInCents(pack.id) || 0) / 100).toFixed(0)} 元</td>
                      <td className="px-6 py-5">
                        <span className="text-[var(--ink-700)] font-bold bg-[var(--ink-50)] px-3 py-1 rounded-full text-sm">
                          {getCreditPackAccessText(pack.id)}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <Button
                          size="sm"
                          className="bg-[var(--ink-50)] hover:bg-[var(--ink-100)] text-[var(--ink-700)] border-2 border-[var(--ink-300)] hover:border-[var(--ink-300)] font-semibold rounded-[var(--radius-soft)] px-6 shadow-sm hover:shadow-md transition-all"
                          onClick={() => handleCreditPurchase(pack.id)}
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

        <div className="max-w-4xl mx-auto mt-16 p-8 bg-gradient-to-br from-gray-50 to-gray-100 rounded-[var(--radius-sharp)] border-2 border-[var(--paper-200)] shadow-[0_4px_20px_rgb(0,0,0,0.08)]">
          <h3 className="text-2xl font-bold text-[var(--ink-900)] mb-6">积分消耗说明 (FAQ)</h3>
          <p className="text-[var(--ink-700)] leading-relaxed mb-6">
            <span className="font-bold text-[var(--ink-900)]">问：积分是如何消耗的？</span>
            <br />
            答：文本生成按实际输入和输出内容计费。输入和输出都会消耗积分，输出越长，消耗越多。系统会在模型返回完成后，根据实际 token 用量扣除积分。
          </p>
          <ul className="space-y-3 text-[var(--ink-700)]">
            <li className="flex items-start">
              <Check className="w-5 h-5 text-[var(--ink-700)] mr-3 flex-shrink-0 mt-0.5" />
              <span>
                <span className="font-bold text-[var(--ink-900)]">输入内容:</span>{" "}
                <span className="font-bold text-[var(--ink-700)]">5 积分 / 1K tokens</span>
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-[var(--ink-700)] mr-3 flex-shrink-0 mt-0.5" />
              <span>
                <span className="font-bold text-[var(--ink-900)]">输出内容:</span>{" "}
                <span className="font-bold text-[var(--ink-700)]">20 积分 / 1K tokens</span>
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-[var(--ink-700)] mr-3 flex-shrink-0 mt-0.5" />
              <span>
                <span className="font-bold text-[var(--ink-900)]">无实际输出内容:</span>{" "}
                <span className="font-bold text-[var(--ink-700)]">不扣文本生成费用</span>
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-[var(--ink-700)] mr-3 flex-shrink-0 mt-0.5" />
              <span>
                <span className="font-bold text-[var(--ink-900)]">长文写作 / 作文批改 / 论文报告:</span>{" "}
                <span className="font-bold text-[var(--ink-700)]">通常会消耗更多积分</span>
              </span>
            </li>
          </ul>
          <div className="mt-6 rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-5 text-sm text-[var(--ink-700)] leading-relaxed">
            <p className="font-bold text-[var(--ink-900)] mb-3">图片和音乐如何扣费？</p>
            <ul className="space-y-2">
              <li>• GPT Image 2：订阅用户可用，白名单用户可测试，按固定积分扣费。</li>
              <li>• GPT Image 1.5 / 1 / Mini：按对应固定积分扣费。</li>
              <li>• Suno：约 100 积分起，实际可能包含文本 token 补扣。</li>
            </ul>
          </div>
          <div className="mt-6 rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-5 text-sm text-[var(--ink-700)] leading-relaxed">
            <p className="font-bold text-[var(--ink-900)] mb-3">作文批改通常消耗多少？</p>
            <p>
              作文批改按实际输入和生成内容计费。输入和输出都会消耗积分，输出内容越详细，消耗积分越多。
            </p>
            <div className="grid gap-2 sm:grid-cols-3 mt-4">
              <div className="rounded-[var(--radius-soft)] bg-[var(--paper-50)] px-3 py-2">
                <span className="block font-semibold text-[var(--ink-900)]">短作文批改</span>
                <span>约 100~300 积分</span>
              </div>
              <div className="rounded-[var(--radius-soft)] bg-[var(--paper-50)] px-3 py-2">
                <span className="block font-semibold text-[var(--ink-900)]">普通作文批改</span>
                <span>约 300~600 积分</span>
              </div>
              <div className="rounded-[var(--radius-soft)] bg-[var(--paper-50)] px-3 py-2">
                <span className="block font-semibold text-[var(--ink-900)]">长作文或详细批改</span>
                <span>可能 600 积分以上</span>
              </div>
            </div>
            <p className="mt-4">以上为预计积分区间，不是固定价格。实际消耗会随作文长度、批改详细程度和生成内容多少变化。</p>
          </div>
          <p className="text-[var(--ink-700)] font-semibold text-sm mt-4">提示：文本价格不按模型名称分档，用户侧只按输入和输出 token 用量结算积分。</p>
          
          {/* 支持链接 */}
          <div className="mt-8 pt-6 border-t border-[var(--paper-200)]">
            <p className="text-[var(--ink-600)] text-center">
              需要更多帮助？{" "}
              <a 
                href="/help" 
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--ink-700)] font-semibold hover:underline"
              >
                查看帮助中心
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
