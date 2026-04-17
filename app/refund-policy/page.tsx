'use client'

import Link from "next/link"
import { ArrowLeft, RefreshCw, AlertCircle, Clock, CreditCard } from "lucide-react"
import { brandColors, slateColors, creamColors } from "@/lib/design-tokens"

export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen" style={{ backgroundColor: creamColors[100] }}>
      {/* 顶部背景 */}
      <div 
        className="relative py-16 md:py-20"
        style={{ 
          background: `linear-gradient(135deg, ${brandColors[700]} 0%, ${brandColors[800]} 100%)`
        }}
      >
        <div className="max-w-4xl mx-auto px-4">
          {/* 返回按钮 */}
          <Link 
            href="/"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回首页</span>
          </Link>
          
          {/* 标题 */}
          <div className="flex items-center gap-4 mb-4">
            <RefreshCw className="w-10 h-10 text-white" />
            <h1 className="text-3xl md:text-4xl font-bold text-white">
              退款政策
            </h1>
          </div>
          <p className="text-white/80 text-lg max-w-2xl">
            保障您的权益，提供透明的退款服务
          </p>
        </div>
        
        {/* 波浪装饰 */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg 
            viewBox="0 0 1440 60" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            className="w-full"
            preserveAspectRatio="none"
          >
            <path 
              d="M0 60 C240 30 480 0 720 0 C960 0 1200 30 1440 60 L1440 60 L0 60Z" 
              fill={creamColors[100]}
            />
          </svg>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-16">
        
        {/* 简介 */}
        <section className="mb-12">
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg leading-relaxed" style={{ color: slateColors[600] }}>
              沈翔智学（https://shenxiang.school）致力于为用户提供优质的AI作文批改服务。我们理解您可能对服务有疑问，因此制定了以下退款政策，确保您的权益得到保障。
            </p>
            <p className="text-lg leading-relaxed mt-4" style={{ color: slateColors[600] }}>
              更新日期：{new Date().getFullYear()}年{new Date().getMonth() + 1}月{new Date().getDate()}日
            </p>
          </div>
        </section>

        {/* 7天无理由退款 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            1. 7天无理由退款
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div className="space-y-4" style={{ color: slateColors[600] }}>
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 mt-1 shrink-0" style={{ color: brandColors[600] }} />
                <div>
                  <h3 className="font-semibold mb-1" style={{ color: slateColors[800] }}>适用条件</h3>
                  <p>自购买之日起7天内，如果您对我们的服务不满意，可以申请无理由退款。</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 mt-1 shrink-0" style={{ color: brandColors[600] }} />
                <div>
                  <h3 className="font-semibold mb-1" style={{ color: slateColors[800] }}>使用限制</h3>
                  <p>若您的积分使用量未超过购买总量的50%，可以申请全额退款。</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <CreditCard className="w-5 h-5 mt-1 shrink-0" style={{ color: brandColors[600] }} />
                <div>
                  <h3 className="font-semibold mb-1" style={{ color: slateColors[800] }}>退款方式</h3>
                  <p>退款将按照原支付方式退回，通常在申请通过后3-5个工作日内到账。</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 积分使用规则 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            2. 积分使用规则
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <ul className="space-y-3" style={{ color: slateColors[600] }}>
              <li>• 已使用的积分不可退款</li>
              <li>• 积分可用于作文批改、润色、创意建议等服务</li>
              <li>• 积分有效期为自购买之日起一年</li>
              <li>• 积分不可转让或兑换现金</li>
            </ul>
          </div>
        </section>

        {/* 退款流程 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            3. 退款流程
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <ol className="space-y-3" style={{ color: slateColors[600] }}>
              <li>1. 联系客服说明退款原因</li>
              <li>2. 提供账户信息和购买凭证</li>
              <li>3. 客服将在1-3个工作日内审核</li>
              <li>4. 审核通过后，退款将在3-5个工作日内到账</li>
            </ol>
          </div>
        </section>

        {/* 退款条件 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            4. 退款条件
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg leading-relaxed mb-4" style={{ color: slateColors[600] }}>
              以下情况不支持退款：
            </p>
            <ul className="space-y-3" style={{ color: slateColors[600] }}>
              <li>• 已使用超过50%积分的情况</li>
              <li>• 购买时间超过7天的情况</li>
              <li>• 因个人原因（如忘记使用、改变主意等）超过7天申请</li>
              <li>• 服务已按照合同约定完成的情况</li>
            </ul>
          </div>
        </section>

        {/* 联系客服 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            5. 联系客服
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg mb-4" style={{ color: slateColors[600] }}>
              如需申请退款或有任何疑问，请联系我们的客服团队：
            </p>
            <ul className="space-y-3" style={{ color: slateColors[600] }}>
              <li>• 客服电话：19132896773</li>
              <li>• 客服邮箱：support@shenxiang.school</li>
              <li>• 工作时间：周一至周五 9:00-18:00</li>
            </ul>
          </div>
        </section>

        {/* 政策说明 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            6. 政策说明
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg leading-relaxed" style={{ color: slateColors[600] }}>
              本退款政策可能会根据法律法规和业务发展需要进行调整。调整后的政策将在本页面上公布，并自公布之日起生效。我们鼓励您定期查阅最新的退款政策。
            </p>
          </div>
        </section>

        {/* 底部导航 */}
        <div className="border-t pt-8" style={{ borderColor: slateColors[100] }}>
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/pricing" className="text-sm hover:underline" style={{ color: slateColors[600] }}>
              价格方案
            </Link>
            <Link href="/privacy" className="text-sm hover:underline" style={{ color: slateColors[600] }}>
              隐私政策
            </Link>
            <Link href="/terms" className="text-sm hover:underline" style={{ color: slateColors[600] }}>
              服务条款
            </Link>
            <Link href="/about" className="text-sm hover:underline" style={{ color: slateColors[600] }}>
              关于我们
            </Link>
          </div>
          <p className="text-center text-sm mt-4" style={{ color: slateColors[400] }}>
            © {new Date().getFullYear()} 沈翔智学. All rights reserved.
          </p>
        </div>
      </div>
    </main>
  )
}