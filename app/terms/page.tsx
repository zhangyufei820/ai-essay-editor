'use client'

import Link from "next/link"
import { ArrowLeft, FileText, AlertTriangle, CheckCircle, XCircle } from "lucide-react"
import { brandColors, slateColors, creamColors } from "@/lib/design-tokens"

export default function TermsPage() {
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
            <FileText className="w-10 h-10 text-white" />
            <h1 className="text-3xl md:text-4xl font-bold text-white">
              服务条款
            </h1>
          </div>
          <p className="text-white/80 text-lg max-w-2xl">
            使用沈翔智学服务前请仔细阅读本条款
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
              欢迎使用沈翔智学（以下简称「本服务」）。本服务条款（以下简称「本条款」）是您与沈翔智学之间关于使用本服务的法律协议。在使用本服务前，请仔细阅读本条款。
            </p>
            <p className="text-lg leading-relaxed mt-4" style={{ color: slateColors[600] }}>
              您使用本服务即表示您已阅读并同意接受本条款的全部内容。如果您不同意本条款的任何内容，请立即停止使用本服务。
            </p>
            <p className="text-lg leading-relaxed mt-4" style={{ color: slateColors[600] }}>
              更新日期：{new Date().getFullYear()}年{new Date().getMonth() + 1}月{new Date().getDate()}日
            </p>
          </div>
        </section>

        {/* 服务内容 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            1. 服务内容
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg leading-relaxed mb-4" style={{ color: slateColors[600] }}>
              沈翔智学为用户提供以下服务：
            </p>
            <ul className="space-y-3" style={{ color: slateColors[600] }}>
              <li>• 作文批改：AI 自动批改作文并提供修改建议</li>
              <li>• 智能对话：与全球顶尖 AI 大模型进行对话交流</li>
              <li>• 学习规划：制定个性化的学习计划</li>
              <li>• 图片生成：输入描述生成精美图片</li>
              <li>• 音乐创作：利用 AI 创作原创音乐</li>
              <li>• 其他相关 AI 教育服务</li>
            </ul>
          </div>
        </section>

        {/* 用户账户 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            2. 用户账户
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div className="space-y-4" style={{ color: slateColors[600] }}>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 mt-1 shrink-0" style={{ color: brandColors[600] }} />
                <div>
                  <h3 className="font-semibold mb-1" style={{ color: slateColors[800] }}>账户注册</h3>
                  <p>您需要注册账户才能使用本服务的部分功能。注册时需提供真实、准确、完整的个人信息。</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 mt-1 shrink-0" style={{ color: brandColors[600] }} />
                <div>
                  <h3 className="font-semibold mb-1" style={{ color: slateColors[800] }}>账户安全</h3>
                  <p>您应妥善保管账户信息，对账户密码的安全性负责。任何使用您账户的行为将被视为您本人行为。</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 mt-1 shrink-0" style={{ color: brandColors[600] }} />
                <div>
                  <h3 className="font-semibold mb-1" style={{ color: slateColors[800] }}>账户注销</h3>
                  <p>您有权随时注销您的账户。注销账户后，我们将根据隐私政策处理您的个人信息。</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 用户行为规范 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            3. 用户行为规范
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg mb-4" style={{ color: slateColors[600] }}>
              您在使用本服务时，应遵守以下行为规范：
            </p>
            <ul className="space-y-3" style={{ color: slateColors[600] }}>
              <li className="flex items-start gap-2">
                <XCircle className="w-5 h-5 mt-1 shrink-0 text-red-500" />
                <span>不得发布或传播违法违规内容</span>
              </li>
              <li className="flex items-start gap-2">
                <XCircle className="w-5 h-5 mt-1 shrink-0 text-red-500" />
                <span>不得进行任何危害网络安全的行为</span>
              </li>
              <li className="flex items-start gap-2">
                <XCircle className="w-5 h-5 mt-1 shrink-0 text-red-500" />
                <span>不得利用本服务从事任何商业活动（未经授权）</span>
              </li>
              <li className="flex items-start gap-2">
                <XCircle className="w-5 h-5 mt-1 shrink-0 text-red-500" />
                <span>不得侵犯他人知识产权或其他合法权益</span>
              </li>
              <li className="flex items-start gap-2">
                <XCircle className="w-5 h-5 mt-1 shrink-0 text-red-500" />
                <span>不得尝试破解、逆向工程或规避本服务的安全措施</span>
              </li>
              <li className="flex items-start gap-2">
                <XCircle className="w-5 h-5 mt-1 shrink-0 text-red-500" />
                <span>不得以任何方式干扰或破坏本服务的正常运行</span>
              </li>
            </ul>
          </div>
        </section>

        {/* 知识产权 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            4. 知识产权
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg leading-relaxed" style={{ color: slateColors[600] }}>
              本服务及其包含的所有内容（包括但不限于文字、图片、音频、视频、软件、代码等）的知识产权归沈翔智学或其授权方所有。未经书面授权，任何人不得擅自复制、修改、传播、转载或以其他方式使用本服务的内容。
            </p>
            <p className="text-lg leading-relaxed mt-4" style={{ color: slateColors[600] }}>
              您在使用本服务过程中生成的内容（如对话记录、创作作品等）的知识产权归您所有，但您授予我们全球范围内免费的、非排他性的使用许可，以便我们提供服务。
            </p>
          </div>
        </section>

        {/* 免责声明 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            5. 免责声明
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 shrink-0" style={{ color: '#f59e0b' }} />
              <p className="text-lg" style={{ color: slateColors[600] }}>
                本服务按「现状」提供，不提供任何明示或暗示的保证。
              </p>
            </div>
            <ul className="space-y-3" style={{ color: slateColors[600] }}>
              <li>• 我们不保证本服务将满足您的需求或期望</li>
              <li>• 我们不保证本服务将 uninterrupted（不间断）、及时、安全或无错误</li>
              <li>• 我们不保证通过本服务获得的任何信息或内容的准确性或完整性</li>
              <li>• 您应自行承担使用本服务的风险</li>
            </ul>
          </div>
        </section>

        {/* 责任限制 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            6. 责任限制
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg leading-relaxed" style={{ color: slateColors[600] }}>
              在法律允许的范围内，沈翔智学及其关联公司、董事、员工、代理人不承担以下责任：
            </p>
            <ul className="mt-4 space-y-3" style={{ color: slateColors[600] }}>
              <li>• 因使用或无法使用本服务导致的任何间接、附带、特殊或后果性损害</li>
              <li>• 任何内容错误或遗漏导致的损害</li>
              <li>• 任何第三方行为导致的损害</li>
              <li>• 您在本服务中发表或上传的内容导致的损害</li>
            </ul>
          </div>
        </section>

        {/* 服务变更和终止 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            7. 服务变更和终止
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg leading-relaxed" style={{ color: slateColors[600] }}>
              我们保留随时修改、暂停或终止本服务（或其任何部分）的权利，恕不另行通知。对于本服务的修改、暂停或终止，我们不对您或任何第三方承担责任。
            </p>
            <p className="text-lg leading-relaxed mt-4" style={{ color: slateColors[600] }}>
              如果您违反本条款，我们有权立即终止您对本服务的访问权限，且无需退还任何费用。
            </p>
          </div>
        </section>

        {/* 第三方链接 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            8. 第三方链接
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg leading-relaxed" style={{ color: slateColors[600] }}>
              本服务可能包含指向第三方网站或服务的链接。这些链接仅供您方便使用，不代表我们认可这些第三方网站或服务的内容。我们不对这些第三方网站或服务的内容、隐私政策或实践负责。您访问第三方网站或服务时，风险由您自行承担。
            </p>
          </div>
        </section>

        {/* 争议解决 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            9. 争议解决
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg leading-relaxed" style={{ color: slateColors[600] }}>
              本条款的解释、执行和争议解决均适用中华人民共和国法律。因本条款引起的或与本条款相关的任何争议，双方应首先通过友好协商解决；协商不成的，任何一方均有权向被告住所地人民法院提起诉讼。
            </p>
          </div>
        </section>

        {/* 其他条款 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            10. 其他条款
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg leading-relaxed" style={{ color: slateColors[600] }}>
              本条款构成您与沈翔智学之间关于使用本服务的完整协议，并取代双方之前就本服务达成的任何口头或书面协议。如果本条款的任何条款被认定为无效或不可执行，该条款应在法律允许的范围内予以执行，其余条款仍然有效。
            </p>
            <p className="text-lg leading-relaxed mt-4" style={{ color: slateColors[600] }}>
              我们未能执行本条款的任何权利或条款不构成对该权利或条款的放弃。如果我们放弃追究某项违约行为，不意味着我们放弃追究后续或类似的违约行为。
            </p>
          </div>
        </section>

        {/* 联系我们 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            11. 联系我们
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg mb-4" style={{ color: slateColors[600] }}>
              如果您对本服务条款有任何疑问，请联系我们：
            </p>
            <ul className="space-y-3" style={{ color: slateColors[600] }}>
              <li>• 客服电话：19132896773</li>
              <li>• 客服邮箱：support@shenxiang.school</li>
            </ul>
          </div>
        </section>

        {/* 底部导航 */}
        <div className="border-t pt-8" style={{ borderColor: slateColors[100] }}>
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/pricing" className="text-sm hover:underline" style={{ color: slateColors[600] }}>
              价格方案
            </Link>
            <Link href="/about" className="text-sm hover:underline" style={{ color: slateColors[600] }}>
              关于我们
            </Link>
            <Link href="/help" className="text-sm hover:underline" style={{ color: slateColors[600] }}>
              帮助中心
            </Link>
            <Link href="/privacy" className="text-sm hover:underline" style={{ color: slateColors[600] }}>
              隐私政策
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
