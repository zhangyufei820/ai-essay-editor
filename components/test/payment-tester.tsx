"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, CheckCircle2, AlertCircle } from "lucide-react"
import Link from "next/link"

export function PaymentTester({ onResult }: { onResult: (result: "pass" | "fail") => void }) {
  const paymentMethods = [
    {
      name: "Stripe支付",
      status: "available",
      description: "已集成，支持国际信用卡支付",
      testUrl: "/checkout/standard",
      configRequired: false,
      features: ["信用卡", "借记卡", "Apple Pay", "Google Pay"],
    },
    {
      name: "支付宝支付",
      status: "needs-config",
      description: "需要支付宝开放平台企业认证",
      testUrl: "/checkout/standard",
      configRequired: true,
      envVars: ["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY"],
      features: ["扫码支付", "网页支付"],
    },
    {
      name: "微信支付",
      status: "needs-config",
      description: "需要微信支付商户平台认证",
      testUrl: "/checkout/standard",
      configRequired: true,
      envVars: ["WECHAT_PAY_MCH_ID", "WECHAT_PAY_API_KEY"],
      features: ["Native扫码", "H5支付"],
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>支付功能测试</CardTitle>
        <CardDescription>测试各种支付方式的集成</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {paymentMethods.map((method) => (
          <div key={method.name} className="flex items-start justify-between p-4 border rounded-lg">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{method.name}</h3>
                {method.status === "available" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {method.status === "needs-config" && <AlertCircle className="h-4 w-4 text-yellow-500" />}
              </div>
              <p className="text-sm text-muted-foreground">{method.description}</p>
              <div className="flex flex-wrap gap-1">
                {method.features.map((feature) => (
                  <Badge key={feature} variant="secondary" className="text-xs">
                    {feature}
                  </Badge>
                ))}
              </div>
              {method.configRequired && method.envVars && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">需要的环境变量:</p>
                  <div className="flex flex-wrap gap-1">
                    {method.envVars.map((env) => (
                      <Badge key={env} variant="outline" className="text-xs">
                        {env}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Link href={method.testUrl}>
              <Button size="sm" variant="outline">
                <ExternalLink className="mr-2 h-4 w-4" />
                测试支付
              </Button>
            </Link>
          </div>
        ))}

        <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg space-y-2">
          <h4 className="font-medium text-sm">重要提示</h4>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Stripe支持测试模式，可以使用测试卡号进行测试</li>
            <li>支付宝和微信支付需要真实的商户账号</li>
            <li>测试时请使用小额订单（如0.01元）</li>
            <li>确保配置了正确的回调URL</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
