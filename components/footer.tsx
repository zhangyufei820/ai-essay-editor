import Image from "next/image"
import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t border-[var(--paper-200)] bg-[var(--paper-100)]">
      <div className="container px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="py-16 md:py-24">
            <div className="mb-4">
              <Image
                src="/images/design-mode/site-logo.png"
                alt="沈翔智学"
                width={220}
                height={75}
                className="h-14 w-auto object-contain"
              />
            </div>
            <p className="text-sm text-[var(--ink-500)] leading-relaxed max-w-md">
              专业的AI智能教育平台，为学生、教师和家长提供个性化的学习辅导和作文批改服务。
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-4">产品</h3>
            <ul className="space-y-2 text-sm text-[var(--ink-500)]">
              <li>
                <Link href="/ai-writing" className="hover:text-[var(--ink-900)] transition-colors">
                  核心功能
                </Link>
              </li>
              <li>
                <Link href="/essay" className="hover:text-[var(--ink-900)] transition-colors">
                  大师风格
                </Link>
              </li>
              <li>
                <Link href="/chat?agent=standard" className="hover:text-[var(--ink-900)] transition-colors">
                  批改流程
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-[var(--ink-900)] transition-colors">
                  价格方案
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">支持</h3>
            <ul className="space-y-2 text-sm text-[var(--ink-500)]">
              <li>
                <Link href="/help" className="hover:text-[var(--ink-900)] transition-colors">
                  帮助中心
                </Link>
              </li>
              <li>
                <Link href="/help" className="hover:text-[var(--ink-900)] transition-colors">
                  使用指南
                </Link>
              </li>
              <li>
                <Link href="/help" className="hover:text-[var(--ink-900)] transition-colors">
                  常见问题
                </Link>
              </li>
              <li>
                <Link href="mailto:support@shenxiang.school" className="hover:text-[var(--ink-900)] transition-colors">
                  联系我们
                </Link>
              </li>
              <li>
                <Link href="/refund-policy" className="hover:text-[var(--ink-900)] transition-colors">
                  退款政策
                </Link>
              </li>
            </ul>
            <p className="mt-4 text-xs text-[var(--ink-500)]">
              客服邮箱：support@shenxiang.school
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-4">法务</h3>
            <ul className="space-y-2 text-sm text-[var(--ink-500)]">
              <li>
                <Link href="/privacy" className="hover:text-[var(--ink-900)] transition-colors">
                  隐私政策
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-[var(--ink-900)] transition-colors">
                  服务条款
                </Link>
              </li>
              <li>
                <Link href="/refund-policy" className="hover:text-[var(--ink-900)] transition-colors">
                  退款政策
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-[var(--paper-200)] pt-8 text-center text-sm text-[var(--ink-500)]">
          <p>© 2026 沈翔智学. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
