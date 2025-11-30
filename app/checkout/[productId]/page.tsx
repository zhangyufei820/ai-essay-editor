"use client"

import { notFound, useRouter } from "next/navigation"
import { PRODUCTS } from "@/lib/products"
import Checkout from "@/components/checkout"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BETA_CONFIG } from "@/lib/beta-config"
import { use } from "react"

export default function CheckoutPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = use(params)
  const router = useRouter()
  const product = PRODUCTS.find((p) => p.id === productId)

  if (!product) {
    notFound()
  }

  if (product.priceInCents === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">免费体验</h1>
          <p className="text-muted-foreground mb-6">体验版无需支付，请直接使用服务</p>
          <Link
            href="/chat"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            开始使用
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        <Link
          href="/#pricing"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          返回定价
        </Link>

        <div className="max-w-4xl mx-auto">
          <div className="bg-card rounded-2xl shadow-lg p-8 mb-8">
            <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
            <p className="text-muted-foreground mb-4">{product.description}</p>
            <div className="text-4xl font-bold text-primary mb-6">¥{(product.priceInCents / 100).toFixed(2)}</div>
            <ul className="space-y-2 mb-6">
              {product.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-primary mt-1">✓</span>
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-card rounded-2xl shadow-lg p-8">
            <h2 className="text-xl font-semibold mb-4">选择支付方式</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2 bg-transparent relative"
                onClick={() =>
                  BETA_CONFIG.payment.alipay &&
                  (window.location.href = `/api/payment/alipay/create?productId=${productId}`)
                }
                disabled={!BETA_CONFIG.payment.alipay}
              >
                <svg className="h-8 w-8" viewBox="0 0 24 24" fill={BETA_CONFIG.payment.alipay ? "#1677FF" : "#999"}>
                  <path d="M18.277 3H5.723A2.723 2.723 0 003 5.723v12.554A2.723 2.723 0 005.723 21h12.554A2.723 2.723 0 0021 18.277V5.723A2.723 2.723 0 0018.277 3zm1.305 13.739c-1.134.452-2.344.804-3.604 1.044-.975-1.127-1.82-2.408-2.504-3.808h3.208v-1.283h-3.77v-1.095h3.77V10.31h-3.77V9.215h3.77V7.932h-8.285v1.283h3.77v1.095h-3.77v1.287h3.77v1.283h-3.77c-.684 1.4-1.529 2.681-2.504 3.808-1.26-.24-2.47-.592-3.604-1.044v-2.168h8.285v-1.283H4.418V9.215h8.285V7.932H4.418V5.723c0-.753.61-1.363 1.363-1.363h12.438c.753 0 1.363.61 1.363 1.363v11.016z" />
                </svg>
                <span className="font-medium">支付宝</span>
                {!BETA_CONFIG.payment.alipay && (
                  <Badge variant="secondary" className="absolute top-2 right-2 bg-orange-100 text-orange-700 text-xs">
                    即将上线
                  </Badge>
                )}
              </Button>

              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2 bg-transparent relative"
                onClick={() =>
                  BETA_CONFIG.payment.wechatPay &&
                  (window.location.href = `/api/payment/wechat/create?productId=${productId}`)
                }
                disabled={!BETA_CONFIG.payment.wechatPay}
              >
                <svg className="h-8 w-8" viewBox="0 0 24 24" fill={BETA_CONFIG.payment.wechatPay ? "#07C160" : "#999"}>
                  <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
                </svg>
                <span className="font-medium">微信支付</span>
                {!BETA_CONFIG.payment.wechatPay && (
                  <Badge variant="secondary" className="absolute top-2 right-2 bg-orange-100 text-orange-700 text-xs">
                    即将上线
                  </Badge>
                )}
              </Button>

              <div className="md:col-span-1">
                <div className="text-sm font-medium mb-2 flex items-center gap-2">
                  Stripe国际支付
                  <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                    可用
                  </Badge>
                </div>
                <Checkout productId={productId} />
              </div>
            </div>

            <div className="mt-6 p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                💡 公测提示：目前支持Stripe国际支付（信用卡/借记卡）。支付宝和微信支付正在申请中，即将上线。
              </p>
            </div>
            {/* </CHANGE> */}
          </div>
        </div>
      </div>
    </div>
  )
}
