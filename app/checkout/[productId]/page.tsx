"use client"

import {
  AlertV2 as Alert,
  AlertV2Description as AlertDescription,
  BadgeV2 as Badge,
  ButtonV2 as Button
} from "@/components/ui/v2"
import { notFound, useRouter, useSearchParams } from "next/navigation"
import { PRODUCTS, requiresMembership, hasActiveMembership, getProductPriceInCents } from "@/lib/products"
import { ArrowLeft, Loader2, LogIn, CheckCircle2, ExternalLink, AlertTriangle, Crown } from "lucide-react"
import Link from "next/link"
import { BETA_CONFIG } from "@/lib/beta-config"
import { extractUserId } from "@/lib/auth-user"
import { use, useEffect, useState, Suspense } from "react"
import { createClient } from "@/lib/supabase/client"

async function getVerifiedAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window !== "undefined") {
    const authingToken = localStorage.getItem("idToken") || localStorage.getItem("authingToken") || localStorage.getItem("accessToken")
    try {
      const currentUserId = extractUserId(JSON.parse(localStorage.getItem("currentUser") || "null"))
      if (authingToken && /^[a-f0-9]{24}$/i.test(currentUserId)) {
        return { Authorization: `Bearer ${authingToken}` }
      }
    } catch {
      // Fall through to the verified Supabase session check.
    }
  }

  const supabase = createClient()
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    if (data.session?.access_token) return { Authorization: `Bearer ${data.session.access_token}` }
  }
  if (typeof window === "undefined") return {}
  const authingToken = localStorage.getItem("idToken") || localStorage.getItem("authingToken") || localStorage.getItem("accessToken")
  return authingToken ? { Authorization: `Bearer ${authingToken}` } : {}
}

function CheckoutFlow({ productId }: { productId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const product = PRODUCTS.find((p) => p.id === productId)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isPaying, setIsPaying] = useState(false)
  const [membershipStatus, setMembershipStatus] = useState<string | null>(null)
  
  // 新增：如果跳转失败，显示手动支付链接
  const [manualPayUrl, setManualPayUrl] = useState<string | null>(null)

  const billing = searchParams.get("billing") || "monthly"
  
  // 检查产品是否需要会员
  const needsMembership = requiresMembership(productId)
  const isUserMember = hasActiveMembership(membershipStatus)

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
            } catch (e) { console.error('解析本地用户信息失败:', e) }
          }
        }
        const membershipRes = await fetch('/api/user/membership', {
          headers: await getVerifiedAuthHeaders(),
        })
        if (membershipRes.ok) {
          const membership = await membershipRes.json()
          setMembershipStatus(membership.type === "免费" ? null : membership.type)
        }
      } catch (error) {
        console.error('检查登录状态失败:', error)
      } finally {
        setLoading(false)
      }
    }
    checkAuth()
  }, [])

  if (!product) { notFound() }

  const isSubscription = product.productType === "membership"
  const displayPrice = getProductPriceInCents(productId, billing) || product.priceInCents
  
  const checkoutUrl = `/checkout/${productId}?billing=${billing}`
  const loginRedirectUrl = `/login?redirect=${encodeURIComponent(checkoutUrl)}`

  // ==========================================
  // 强力跳转修复版
  // ==========================================
  const handlePayment = async () => {
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

      const apiUrl = `/api/payment/xunhupay/create?productId=${productId}&type=wechat&billing=${billing}`
      console.log("正在请求:", apiUrl);
      
      const res = await fetch(apiUrl, {
        headers: await getVerifiedAuthHeaders(),
      })
      const data = await res.json()
      
      console.log("API响应:", data);

      if (!res.ok) {
        // 特殊处理会员限制错误
        if (data.requiresMembership) {
          alert(`❌ ${data.error}\n\n${data.details}\n\n请先订阅会员套餐后再购买积分充值包。`)
          setIsPaying(false)
          return
        }
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
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
                <p className="text-muted-foreground">{product.description}</p>
              </div>
              {needsMembership && (
                <Badge variant="paper" className="flex items-center gap-1">
                  <Crown className="h-3 w-3" />
                  会员专享
                </Badge>
              )}
            </div>
            <div className="text-4xl font-bold text-primary mb-3">
              ¥{(displayPrice / 100).toFixed(2)}
              <span className="text-lg text-muted-foreground ml-2">/ {billing === "annual" ? "年" : billing === "monthly" ? "月" : "次"}</span>
            </div>
            {isSubscription && billing === "annual" && (
              <p className="text-sm text-green-700 font-medium">年付已按月付 × 12 × 8 折计算，权益按月发放。</p>
            )}
            {product.productType === "credits" && (
              <p className="text-sm text-amber-700 font-medium">
                积分充值包永久有效。500 / 1,000 积分包订阅用户可买；5,000 积分包专业版及以上可买；10,000 积分包豪华版及以上可买。
              </p>
            )}
          </div>

          {/* 会员限制提示 */}
          {needsMembership && !isUserMember && (
            <Alert className="mb-6 border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-900">
                <div className="font-semibold mb-2">⚠️ 积分充值包仅限会员购买</div>
                <p className="text-sm mb-3">
                  500 / 1,000 积分包订阅用户可买；5,000 积分包专业版及以上可买；10,000 积分包豪华版及以上可买。
                </p>
                <Link href="/#pricing">
                  <Button size="sm" variant="primary" className="bg-amber-600 hover:bg-amber-700">
                    <Crown className="h-4 w-4 mr-2" />
                    立即订阅会员
                  </Button>
                </Link>
              </AlertDescription>
            </Alert>
          )}

          {/* 会员身份确认 */}
          {needsMembership && isUserMember && (
            <Alert className="mb-6 border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-900">
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4" />
                  <span className="font-semibold">您是 {membershipStatus?.toUpperCase()} 会员，可以购买积分充值包</span>
                </div>
              </AlertDescription>
            </Alert>
          )}

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
            <h2 className="text-xl font-semibold mb-2">扫码支付</h2>
            <p className="text-sm text-muted-foreground mb-4">
              使用微信扫码完成支付。支付完成后会自动跳转到结果页；如权益未及时到账，请保存订单号并联系 support@shenxiang.school。
            </p>
            
            {/* 如果需要会员但用户不是会员，禁用支付按钮 */}
            {needsMembership && !isUserMember && (
              <div className="mb-4 p-4 bg-muted rounded-lg text-center text-muted-foreground">
                请先订阅会员后再购买积分充值包
              </div>
            )}
            
            <div className="grid grid-cols-1 gap-4 mb-6">
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => handlePayment()}
                disabled={!BETA_CONFIG.payment.xunhupay || isPaying || (needsMembership && !isUserMember)}
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
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#10A37F]" />
          <p className="text-muted-foreground">正在加载...</p>
        </div>
      </div>
    }>
      <CheckoutFlow productId={productId} />
    </Suspense>
  )
}
