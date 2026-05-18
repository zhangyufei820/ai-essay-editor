import Link from "next/link"
import { ArrowLeft, Lock, Eye, UserCheck } from "lucide-react"
import { IconSealCheck } from "@/components/icons/v2"
import { brandColors, slateColors, creamColors } from "@/lib/design-tokens"

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--paper-50)] font-[var(--font-sans-v2)] text-[var(--ink-900)]">
      {/* 顶部背景 */}
      <div 
        className="relative py-16 md:py-20"
        style={{ 
          background: "linear-gradient(135deg, var(--ink-700) 0%, var(--ink-800) 100%)"
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
            <IconSealCheck className="w-10 h-10 text-white" />
            <h1 className="text-3xl md:text-4xl font-bold text-white font-[var(--font-display)]">
              隐私政策
            </h1>
          </div>
          <p className="text-white/80 text-lg max-w-2xl">
            保护您的隐私是我们最重要的责任
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
              fill="var(--paper-50)"
            />
          </svg>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-16">
        
        {/* 简介 */}
        <section className="mb-12">
          <div className="bg-[var(--paper-50)] rounded-[var(--radius-sharp)] p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg leading-relaxed" style={{ color: "var(--ink-600)" }}>
              沈翔智学（以下简称「我们」）非常重视用户的隐私保护。本隐私政策旨在说明我们如何收集、使用、存储和保护您的个人信息。请您在使用我们的服务前仔细阅读本政策。
            </p>
            <p className="text-lg leading-relaxed mt-4" style={{ color: "var(--ink-600)" }}>
              更新日期：{new Date().getFullYear()}年{new Date().getMonth() + 1}月{new Date().getDate()}日
            </p>
          </div>
        </section>

        {/* 收集的信息 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 font-[var(--font-display)]" style={{ color: "var(--ink-800)" }}>
            1. 我们收集的信息
          </h2>
          <div className="bg-[var(--paper-50)] rounded-[var(--radius-sharp)] p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div className="space-y-4" style={{ color: "var(--ink-600)" }}>
              <div className="flex items-start gap-3">
                <UserCheck className="w-5 h-5 mt-1 shrink-0" style={{ color: "var(--ink-600)" }} />
                <div>
                  <h3 className="font-semibold mb-1" style={{ color: "var(--ink-800)" }}>账户信息</h3>
                  <p>当您注册账户时，我们可能会收集您的手机号码、电子邮箱、微信 OpenID 等用于账户创建和验证。</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Eye className="w-5 h-5 mt-1 shrink-0" style={{ color: "var(--ink-600)" }} />
                <div>
                  <h3 className="font-semibold mb-1" style={{ color: "var(--ink-800)" }}>使用数据</h3>
                  <p>我们会自动收集您在使用服务过程中的行为数据，包括但不限于登录时间、功能使用情况、互动记录等。</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 mt-1 shrink-0" style={{ color: "var(--ink-600)" }} />
                <div>
                  <h3 className="font-semibold mb-1" style={{ color: "var(--ink-800)" }}>订单与支付状态</h3>
                  <p>当您购买积分、会员或其他付费服务时，我们会记录订单号、商品类型、支付状态、权益到账状态等必要信息。</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 mt-1 shrink-0" style={{ color: "var(--ink-600)" }} />
                <div>
                  <h3 className="font-semibold mb-1" style={{ color: "var(--ink-800)" }}>设备信息</h3>
                  <p>我们可能会收集您的设备信息，包括设备类型、操作系统、浏览器类型等，以优化服务体验。</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <UserCheck className="w-5 h-5 mt-1 shrink-0" style={{ color: "var(--ink-600)" }} />
                <div>
                  <h3 className="font-semibold mb-1" style={{ color: "var(--ink-800)" }}>客服沟通记录</h3>
                  <p>当您通过邮件、电话或帮助中心联系我们时，我们可能会保存沟通内容、处理进度和反馈结果，用于解决问题和改进服务。</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 信息使用 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 font-[var(--font-display)]" style={{ color: "var(--ink-800)" }}>
            2. 我们如何使用信息
          </h2>
          <div className="bg-[var(--paper-50)] rounded-[var(--radius-sharp)] p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <ul className="space-y-4" style={{ color: "var(--ink-600)" }}>
              <li>• 提供、维护和改进我们的服务</li>
              <li>• 处理您的注册和登录请求</li>
              <li>• 处理订单、核对支付状态、完成积分到账或会员权益开通</li>
              <li>• 提供客服支持、处理退款申请和权益异常反馈</li>
              <li>• 进行必要的安全风控、异常登录识别和滥用防范</li>
              <li>• 向您推送更新、优惠活动等信息</li>
              <li>• 响应您的咨询和反馈</li>
              <li>• 分析用户行为，优化产品体验</li>
              <li>• 遵守法律法规要求</li>
            </ul>
          </div>
        </section>

        {/* 信息保护 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 font-[var(--font-display)]" style={{ color: "var(--ink-800)" }}>
            3. 信息保护措施
          </h2>
          <div className="bg-[var(--paper-50)] rounded-[var(--radius-sharp)] p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg leading-relaxed" style={{ color: "var(--ink-600)" }}>
              我们采用行业标准的安全措施保护您的个人信息，包括但不限于：
            </p>
            <ul className="mt-4 space-y-3" style={{ color: "var(--ink-600)" }}>
              <li>• 数据加密传输（HTTPS/SSL）</li>
              <li>• 严格的访问控制权限管理</li>
              <li>• 定期安全审计和漏洞扫描</li>
              <li>• 安全事件应急响应机制</li>
            </ul>
          </div>
        </section>

        {/* 信息共享 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 font-[var(--font-display)]" style={{ color: "var(--ink-800)" }}>
            4. 信息共享
          </h2>
          <div className="bg-[var(--paper-50)] rounded-[var(--radius-sharp)] p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg leading-relaxed" style={{ color: "var(--ink-600)" }}>
              我们不会向第三方出售、交易或转让您的个人信息。在以下情况下，我们可能会共享您的信息：
            </p>
            <ul className="mt-4 space-y-3" style={{ color: "var(--ink-600)" }}>
              <li>• 获得您的明确同意后</li>
              <li>• 为提供服务而与合作伙伴共享（如云存储服务提供商）</li>
              <li>• 法律法规要求或政府机关依法查询</li>
              <li>• 为保护我们或用户的权利、财产而必须共享时</li>
            </ul>
          </div>
        </section>

        {/* 您的权利 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 font-[var(--font-display)]" style={{ color: "var(--ink-800)" }}>
            5. 您的权利
          </h2>
          <div className="bg-[var(--paper-50)] rounded-[var(--radius-sharp)] p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg leading-relaxed mb-4" style={{ color: "var(--ink-600)" }}>
              根据适用法律，您享有以下权利：
            </p>
            <ul className="space-y-3" style={{ color: "var(--ink-600)" }}>
              <li>• <strong>访问权</strong>：了解我们收集了哪些关于您的信息</li>
              <li>• <strong>更正权</strong>：要求更正不准确或不完整的信息</li>
              <li>• <strong>删除权</strong>：要求删除您的个人信息</li>
              <li>• <strong>注销权</strong>：注销您的账户</li>
              <li>• <strong>导出权</strong>：导出您的个人数据</li>
            </ul>
            <p className="text-lg leading-relaxed mt-4" style={{ color: "var(--ink-600)" }}>
              如需行使上述权利，请联系客服：support@shenxiang.school
            </p>
          </div>
        </section>

        {/* 儿童隐私 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 font-[var(--font-display)]" style={{ color: "var(--ink-800)" }}>
            6. 儿童隐私
          </h2>
          <div className="bg-[var(--paper-50)] rounded-[var(--radius-sharp)] p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg leading-relaxed" style={{ color: "var(--ink-600)" }}>
              我们的服务主要面向成年人。对于未满 18 岁的未成年人使用服务，需要在监护人的同意和指导下进行。我们不会故意收集儿童的个人信息，如发现未经监护人同意收集儿童信息的情况，我们会及时删除相关信息。
            </p>
          </div>
        </section>

        {/* 政策更新 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 font-[var(--font-display)]" style={{ color: "var(--ink-800)" }}>
            7. 政策更新
          </h2>
          <div className="bg-[var(--paper-50)] rounded-[var(--radius-sharp)] p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg leading-relaxed" style={{ color: "var(--ink-600)" }}>
              我们可能会不时更新本隐私政策。更新后的政策将在本页面上公布，并自公布之日起生效。我们鼓励您在每次访问时查阅最新的隐私政策，以了解我们如何保护您的信息。
            </p>
          </div>
        </section>

        {/* 联系我们 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 font-[var(--font-display)]" style={{ color: "var(--ink-800)" }}>
            8. 联系我们
          </h2>
          <div className="bg-[var(--paper-50)] rounded-[var(--radius-sharp)] p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg mb-4" style={{ color: "var(--ink-600)" }}>
              如果您对本隐私政策有任何疑问或建议，请联系我们：
            </p>
            <ul className="space-y-3" style={{ color: "var(--ink-600)" }}>
              <li>• 客服电话：19132896773</li>
              <li>• 客服邮箱：support@shenxiang.school</li>
            </ul>
          </div>
        </section>

        {/* 底部导航 */}
        <div className="border-t pt-8" style={{ borderColor: "var(--paper-200)" }}>
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/pricing" className="text-sm hover:underline" style={{ color: "var(--ink-600)" }}>
              价格方案
            </Link>
            <Link href="/about" className="text-sm hover:underline" style={{ color: "var(--ink-600)" }}>
              关于我们
            </Link>
            <Link href="/help" className="text-sm hover:underline" style={{ color: "var(--ink-600)" }}>
              帮助中心
            </Link>
            <Link href="/terms" className="text-sm hover:underline" style={{ color: "var(--ink-600)" }}>
              服务条款
            </Link>
          </div>
          <p className="text-center text-sm mt-4" style={{ color: "var(--ink-400)" }}>
            © {new Date().getFullYear()} 沈翔智学. All rights reserved.
          </p>
        </div>
      </div>
    </main>
  )
}
