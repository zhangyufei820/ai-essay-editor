import type React from "react"
import type { Metadata, Viewport } from "next"
import "./globals.css"
import "katex/dist/katex.min.css"
import { AppShell } from "@/components/app-shell"
import { ClientBoot } from "@/components/client-boot"

// ============================================
// Schema.org 结构化数据（模块级别常量，避免每次渲染重复创建对象）
// ============================================

const SITE_TITLE = "沈翔智学｜AI作文批改 · 写作提分工具"
const SITE_DESCRIPTION = "上传作文，AI逐段批改、指出问题、给出提分建议，帮助小学、初中、高中学生提升写作能力。"
const SITE_KEYWORDS = "AI作文批改,作文批改,写作提分,作文润色,语文学习,智能教育,沈翔智学"
const SITE_IMAGE_URL = "https://shenxiang.school/images/design-mode/site-main.jpg"

const WEBSITE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "沈翔智学",
  url: "https://shenxiang.school",
  description: SITE_DESCRIPTION,
  publisher: {
    "@type": "Organization",
    name: "沈翔智学",
    url: "https://shenxiang.school",
  },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://shenxiang.school/chat/standard?query={search_term_string}",
    },
    "query-input": "required name=search_term_string",
  },
}

const SOFTWARE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "沈翔智学",
  applicationCategory: "EducationApplication",
  operatingSystem: "Web",
  description: SITE_DESCRIPTION,
  url: "https://shenxiang.school",
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "CNY",
    availability: "https://schema.org/InStock",
  },
}

// PWA 视口配置
export const viewport: Viewport = {
  themeColor: "#14532d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: true,
  viewportFit: "cover",
}

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  authors: [{ name: "沈翔智学" }],
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: "https://shenxiang.school",
    siteName: "沈翔智学",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: SITE_IMAGE_URL,
        width: 586,
        height: 309,
        alt: "沈翔智学 - AI智能作文批改",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@shenxiangschool",
    creator: "@shenxiangschool",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SITE_IMAGE_URL],
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "沈翔智学",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      {/* ✅ 新增：在这里通过 CDN 引入 Authing 样式，避开 Next.js 编译错误 */}
      <head>
        {/* 🚀 DNS 预解析 - 提前解析外部身份与数据服务域名，减少首屏延迟 */}
        <link rel="dns-prefetch" href="//cdn.authing.co" />
        <link rel="preconnect" href="https://cdn.authing.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={`//${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^https?:\/\//, '')}`} />
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL || ''} crossOrigin="anonymous" />
        
        {/* Authing CSS 由登录页自行动态加载（guard-react 组件内部加载），无需全局同步引入 */}
        {/* PWA Apple 图标 - 使用本域名静态资源，避免依赖当前未稳定接入的 CDN 子域 */}
        <link rel="apple-touch-icon" href="/images/design-mode/site-logo.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/images/design-mode/site-logo.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/images/design-mode/site-logo.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/images/design-mode/site-logo.png" />

        {/* Schema.org 结构化数据 - 网站信息 */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_SCHEMA) }}
        />

        {/* Schema.org 结构化数据 - 软件应用 */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_SCHEMA) }}
        />
      </head>
      <body className={`font-sans antialiased`}>
        {/* ✅ 无障碍：跳转到主要内容的快捷链接（WCAG 2.1） */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-green-900 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          跳转到主要内容
        </a>

        <ClientBoot />

        <AppShell>{children}</AppShell>
        
      </body>
    </html>
  )
}
