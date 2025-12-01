"use client"

import { notFound, useRouter, useSearchParams } from "next/navigation"
import { PRODUCTS } from "@/lib/products"
import { ArrowLeft, Loader2, LogIn, CheckCircle2, ExternalLink } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BETA_CONFIG } from "@/lib/beta-config"
import { use, useEffect, useState, Suspense } from "react"
import { createClient } from "@/lib/supabase/client"
import { Alert, AlertDescription } from "@/components/ui/alert"

function CheckoutFlow({ productId }: { productId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const product = PRODUCTS.find((p) => p.id === productId)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isPaying, setIsPaying] = useState(false)
  
  // 新增：如果跳转失败，显示手动支付链接
  const [manualPayUrl, setManualPayUrl] = useState<string | null>(null)

  const billing = searchParams.get("billing") || "monthly"

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient()
        let supabaseUser = null
        if (supabase) {
          const { data } = await supabase.auth.getUser()
          supabaseUser = data.user
        }
        
        if (supabaseUser) {
          setUser(supabaseUser)
        } else {
          const localUser = localStorage.getItem('currentUser')
          if (localUser) {
            try {
              setUser(JSON.parse(localUser))
            } catch (e) { console.error(e) }
          }
        }
      } catch (error) { console.error(error) } 
      finally { setLoading(false) }
    }
    checkAuth()
  }, [])

  if (!product) { notFound() }

  const displayPrice = product.priceInCents
  const checkoutUrl = `/checkout/${productId}?billing=${billing}`
  const loginRedirectUrl = `/login?redirect=${encodeURIComponent(checkoutUrl)}`

  // ==========================================
  // 强力跳转修复版
  // ==========================================
  const handlePayment = async (type: "alipay" | "wechat") => {
    setManualPayUrl(null); // 重置
    if (!user) {
      router.push(loginRedirectUrl)
      return
    }

    setIsPaying(true)

    try {
      const userId = user.id || user.sub || user.user_id;
      if (!userId) {
          alert("无法获取用户信息，请重新登录")
          router.push(loginRedirectUrl);
          setIsPaying(false); 
          return
      }

      const apiUrl = `/api/payment/xunhupay/create?productId=${productId}&type=${type}&billing=${billing}&userId=${userId}`
      console.log("正在请求:", apiUrl);
      
      const res = await fetch(apiUrl)
      const data = await res.json()
      
      console.log("API响应:", data);

      if (!res.ok) {
        throw new Error(data.error || "请求失败")
      }

      const redirectUrl = data.url || data.pay_url || data.link;

      if (redirectUrl) {
        console.log("✅ 获取链接成功，准备跳转:", redirectUrl);
        
        // --- 方案 A: 模拟点击 (兼容性最好) ---
        const link = document.createElement('a');
        link.href = redirectUrl;
        // 如果是微信支付，有些浏览器要求必须在当前页打开才能唤起App
        // 但如果卡住，我们可以尝试 target="_blank"
        link.target = '_self'; 
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // --- 方案 B: 保底策略 ---
        // 如果 2秒后还在当前页面，说明跳转被拦截了
        // 我们显示一个手动点击的按钮
        setTimeout(() => {
           setIsPaying(false);
           setManualPayUrl(redirectUrl);
           console.log("⚠️ 跳转似乎被拦截，已切换为手动模式");
        }, 2000);

      } else {
        throw new Error("未返回支付链接")
      }

    } catch (e: any) {
      console.error(e)
      alert("支付初始化失败: " + e.message)
      setIsPaying(false) 
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        <Link href="/#pricing" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" /> 返回定价
        </Link>

        <div className="max-w-4xl mx-auto">
          <div className="bg-card rounded-2xl shadow-lg p-8 mb-8">
            <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
            <p className="text-muted-foreground mb-4">{product.description}</p>
            <div className="text-4xl font-bold text-primary mb-6">
              ¥{(displayPrice / 100).toFixed(2)}
              <span className="text-lg text-muted-foreground ml-2">/ {billing === "annual" ? "年" : billing === "monthly" ? "月" : "次"}</span>
            </div>
          </div>

          {/* 如果自动跳转失败，显示这个手动支付框 */}
          {manualPayUrl && (
             <Alert className="mb-6 border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-900 flex items-center gap-2">
                支付链接已生成！如果浏览器未自动跳转，请点击：
                <a href={manualPayUrl} className="font-bold underline flex items-center" target="_blank" rel="noopener noreferrer">
                  立即前往支付 <ExternalLink className="h-3 w-3 ml-1"/>
                </a>
              </AlertDescription>
            </Alert>
          )}

          <div className="bg-card rounded-2xl shadow-lg p-8">
            <h2 className="text-xl font-semibold mb-4">选择支付方式</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => handlePayment("alipay")}
                disabled={!BETA_CONFIG.payment.xunhupay || isPaying} 
              >
                {isPaying ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : (
                  <>
                  <svg className="h-8 w-8" viewBox="0 0 24 24" fill={BETA_CONFIG.payment.xunhupay ? "#1677FF" : "#999"}>
                    <path d="M18.277 3H5.723A2.723 2.723 0 003 5.723v12.554A2.723 2.723 0 005.723 21h12.554A2.723 2.723 0 0021 18.277V5.723A2.723 2.723 0 0018.277 3zm1.305 13.739c-1.134.452-2.344.804-3.604 1.044-.975-1.127-1.82-2.408-2.504-3.808h3.208v-1.283h-3.77v-1.095h3.77V10.31h-3.77V9.215h3.77V7.932h-8.285v1.283h3.77v1.095h-3.77v1.287h3.77v1.283h-3.77c-.684 1.4-1.529 2.681-2.504 3.808-1.26-.24-2.47-.592-3.604-1.044v-2.168h8.285v-1.283H4.418V9.215h8.285V7.932H4.418V5.723c0-.753.61-1.363 1.363-1.363h12.438c.753 0 1.363.61 1.363 1.363v11.016z" />
                  </svg>
                  <span className="font-medium text-sm">支付宝</span>
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => handlePayment("wechat")}
                disabled={!BETA_CONFIG.payment.xunhupay || isPaying}
              >
                {isPaying ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : (
                  <>
                  <svg className="h-8 w-8" viewBox="0 0 24 24" fill={BETA_CONFIG.payment.xunhupay ? "#07C160" : "#999"}>
                    <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
                  </svg>
                  <span className="font-medium text-sm">微信支付</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CheckoutPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = use(params)
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CheckoutFlow productId={productId} />
    </Suspense>
  )
}