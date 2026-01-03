"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { 
  Gift, Copy, Check, ChevronLeft, Heart, Sparkles, 
  PartyPopper, Share2
} from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@supabase/supabase-js"
import { motion } from "framer-motion"

// 🎨 品牌色
const BRAND_GREEN = "#4CAF50"
const BRAND_GREEN_DARK = "#2E7D32"
const BRAND_GREEN_LIGHT = "#E8F5E9"

// Supabase 客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function InvitePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [referralCode, setReferralCode] = useState<string>("")
  const [inviteCount, setInviteCount] = useState<number>(0)
  const [totalReward, setTotalReward] = useState<number>(0)
  const [copied, setCopied] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isPaidMember, setIsPaidMember] = useState(false)
  const [checkingMembership, setCheckingMembership] = useState(false)

  useEffect(() => {
    loadUserData()
  }, [])

  const loadUserData = async () => {
    setIsLoading(true)
    
    // 从 localStorage 获取用户
    const userStr = localStorage.getItem('currentUser')
    if (!userStr) {
      router.push('/login')
      return
    }

    try {
      const parsedUser = JSON.parse(userStr)
      const userId = parsedUser.id || parsedUser.sub || parsedUser.userId
      setUser(parsedUser)

      if (userId) {
        // 获取用户的推荐码
        const { data: codeData } = await supabase
          .from('referral_codes')
          .select('code, uses')
          .eq('user_id', userId)
          .single()

        if (codeData) {
          setReferralCode(codeData.code)
          setInviteCount(codeData.uses || 0)
        } else {
          // 如果没有推荐码，生成一个
          const newCode = generateReferralCode(userId)
          await supabase.from('referral_codes').insert({
            user_id: userId,
            code: newCode,
            uses: 0
          })
          setReferralCode(newCode)
        }

        // 获取邀请奖励总额
        const { data: referrals } = await supabase
          .from('referrals')
          .select('reward_credits')
          .eq('referrer_id', userId)
          .eq('status', 'completed')

        if (referrals) {
          const total = referrals.reduce((sum, r) => sum + (r.reward_credits || 0), 0)
          setTotalReward(total)
        }

        // 🔥 使用后端 API 检查会员状态（绕过 RLS）
        try {
          const response = await fetch('/api/user/membership', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
          })
          const result = await response.json()
          console.log('🔍 [邀请页] 会员检查结果:', result)
          setIsPaidMember(result.isPaidMember === true)
        } catch (e) {
          console.error('会员检查失败:', e)
          setIsPaidMember(false)
        }
      }
    } catch (e) {
      console.error("加载用户数据失败:", e)
    } finally {
      setIsLoading(false)
    }
  }

  const generateReferralCode = (userId: string) => {
    const prefix = "SX"
    const suffix = userId.slice(-6).toUpperCase()
    const random = Math.random().toString(36).substring(2, 5).toUpperCase()
    return `${prefix}${random}${suffix}`
  }

  const inviteLink = typeof window !== 'undefined' 
    ? `${window.location.origin}/auth/sign-up?ref=${referralCode}`
    : ''

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      toast.success("邀请链接已复制！", {
        description: "快去分享给好友吧 🎉"
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      toast.error("复制失败，请手动复制")
    }
  }

  // 🔥 核心逻辑：点击"立即分享"按钮
  const handleShareClick = async () => {
    // 如果是会员，执行分享
    if (isPaidMember) {
      if (navigator.share) {
        try {
          await navigator.share({
            title: '沈翔智学 - 邀请你一起学习',
            text: `我在用沈翔智学，AI智能批改作文超好用！用我的邀请链接注册，我们都能获得1000积分奖励！`,
            url: inviteLink
          })
        } catch (e) {
          // 用户取消分享，改为复制
          handleCopy()
        }
      } else {
        handleCopy()
      }
    } else {
      // 非会员，跳转到订阅页面
      toast.info("成为会员后即可分享邀请链接", {
        description: "正在跳转到订阅页面..."
      })
      setTimeout(() => {
        router.push('/pricing')
      }, 500)
    }
  }

  const remainingReward = 50000 - totalReward
  const progressPercent = Math.min((totalReward / 50000) * 100, 100)

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-green-200 border-t-green-600 rounded-full animate-spin"></div>
          <p className="text-slate-500">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/images/logo.png" alt="沈翔智学" className="h-10 w-auto" />
          </Link>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => router.back()}
            className="text-slate-600"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            返回
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        {/* 🎉 主标题区域 */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 mb-4">
            <PartyPopper className="w-8 h-8 text-amber-500" />
            <h1 className="text-3xl md:text-4xl font-bold text-slate-800">
              邀请好友获取 <span style={{ color: BRAND_GREEN }}>50000</span> 免费积分
            </h1>
          </div>
          <p className="text-slate-500 text-lg">
            分享学习的快乐，一起成长进步
          </p>
        </motion.div>

        {/* 🎁 邀请链接卡片 */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 md:p-8 mb-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: BRAND_GREEN_LIGHT }}
            >
              <Gift className="w-6 h-6" style={{ color: BRAND_GREEN }} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-800">邀请好友，共享奖励</h2>
              <p className="text-sm text-slate-500">分享给好友，双方各得 1000 积分</p>
            </div>
          </div>

          {/* 邀请链接输入框（会员可见） */}
          {isPaidMember && (
            <div className="flex gap-3 mb-6">
              <div className="flex-1 bg-slate-50 rounded-xl px-4 py-3 text-slate-600 text-sm truncate border border-slate-200">
                {inviteLink}
              </div>
              <Button
                onClick={handleCopy}
                className="shrink-0 text-white px-6"
                style={{ backgroundColor: BRAND_GREEN }}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    复制链接
                  </>
                )}
              </Button>
            </div>
          )}

          {/* 🔥 核心按钮：始终显示"立即分享" */}
          <Button
            onClick={handleShareClick}
            className="w-full h-12 text-base text-white"
            style={{ backgroundColor: BRAND_GREEN }}
          >
            <Share2 className="w-5 h-5 mr-2" />
            立即分享
          </Button>

          {/* 非会员提示 */}
          {!isPaidMember && (
            <p className="text-center text-sm text-slate-400 mt-4">
              成为会员后即可获得专属邀请链接
            </p>
          )}

          {/* 邀请统计（会员可见） */}
          {isPaidMember && (
            <>
              <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold" style={{ color: BRAND_GREEN_DARK }}>{inviteCount}</div>
                  <div className="text-sm text-slate-500 mt-1">已邀请好友</div>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-amber-600">{totalReward}</div>
                  <div className="text-sm text-slate-500 mt-1">已获得积分</div>
                </div>
              </div>

              {/* 进度条 */}
              <div className="mt-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500">邀请奖励进度</span>
                  <span style={{ color: BRAND_GREEN }}>{totalReward} / 50000</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: BRAND_GREEN }}
                  />
                </div>
                {remainingReward > 0 && (
                  <p className="text-xs text-slate-400 mt-2 text-center">
                    还可获得 {remainingReward} 积分奖励
                  </p>
                )}
              </div>
            </>
          )}
        </motion.div>

        {/* 📋 规则说明卡片 */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 md:p-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <Heart className="w-5 h-5 text-green-500" />
            </div>
            <h2 className="text-xl font-semibold text-slate-800">温馨提示</h2>
          </div>

          <div className="space-y-4">
            <div className="flex gap-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl">
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm"
                style={{ backgroundColor: BRAND_GREEN }}
              >
                1
              </div>
              <div>
                <h3 className="font-medium text-slate-800 mb-1">双向奖励，共同受益</h3>
                <p className="text-sm text-slate-600">
                  每成功邀请一位好友注册，<strong>您和好友都将获得 1000 积分</strong>。
                  分享知识的同时，也收获满满的奖励！
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl">
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm"
                style={{ backgroundColor: "#10B981" }}
              >
                2
              </div>
              <div>
                <h3 className="font-medium text-slate-800 mb-1">丰厚上限，持续邀请</h3>
                <p className="text-sm text-slate-600">
                  邀请奖励上限为 <strong>50000 积分</strong>，相当于可以免费邀请 50 位好友！
                  积分可用于所有 AI 智能服务。
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-4 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-xl">
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm"
                style={{ backgroundColor: "#14B8A6" }}
              >
                3
              </div>
              <div>
                <h3 className="font-medium text-slate-800 mb-1">会员专属福利</h3>
                <p className="text-sm text-slate-600">
                  邀请功能为付费会员专属。成为会员后，即可开启邀请之旅，
                  与更多朋友一起体验 AI 智能学习的乐趣！
                </p>
              </div>
            </div>
          </div>

          {/* 底部装饰 */}
          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
              <Sparkles className="w-4 h-4" />
              <span>知识因分享而更有价值</span>
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  )
}
