"use client"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check } from "lucide-react"
import Link from "next/link"

const plans = [
  {
    id: "trial",
    name: "体验版",
    price: "免费",
    description: "适合初次尝试的学生",
    features: ["3次免费批改机会", "基础规范性检查", "简单结构优化建议", "标准批改报告"],
    popular: false,
  },
  {
    id: "standard",
    name: "标准版",
    price: "¥49",
    period: "/月",
    description: "适合日常练习的学生",
    features: [
      "30次批改机会/月",
      "完整12步润色流程",
      "文学大师风格润色",
      "徐贲式论述文指导",
      "详细学习要点总结",
      "考场字数严格控制",
    ],
    popular: true,
  },
  {
    id: "professional",
    name: "专业版",
    price: "¥99",
    period: "/月",
    description: "适合备考冲刺的学生",
    features: [
      "无限次批改",
      "完整12步润色流程",
      "12位文学大师风格",
      "徐贲式论述文深度指导",
      "一对一专属指导",
      "优先响应服务",
      "历史批改记录分析",
      "个性化提升方案",
    ],
    popular: false,
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="bg-muted/30 py-20 md:py-32">
      <div className="container px-4">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl mb-4">选择适合的方案</h2>
          <p className="text-lg text-muted-foreground leading-relaxed">灵活的价格方案，满足不同学习阶段的需求</p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {plans.map((plan, index) => (
            <Card key={index} className={`relative ${plan.popular ? "border-primary shadow-lg" : "border-border/50"}`}>
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">最受欢迎</Badge>
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  {plan.period && <span className="text-muted-foreground">{plan.period}</span>}
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm leading-relaxed">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button className="w-full" variant={plan.popular ? "default" : "outline"} asChild>
                  <Link href={plan.price === "免费" ? "/chat" : `/checkout/${plan.id}`}>
                    {plan.price === "免费" ? "立即体验" : "立即购买"}
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">支持信用卡、支付宝、微信支付等多种支付方式</p>
        </div>
      </div>
    </section>
  )
}
