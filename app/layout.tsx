import type React from "react"
import type { Metadata, Viewport } from "next"
import "./globals.css"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { InstallPrompt } from "@/components/pwa/InstallPrompt"
// ✅ 引入刚才新建的微信拦截组件
import WxGuard from "@/components/WxGuard"
import { AsyncStylesheet } from "@/components/AsyncStylesheet"

// PWA 视口配置
export const viewport: Viewport = {
  themeColor: "#14532d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
}

export const metadata: Metadata = {
  title: "沈翔智学 - AI智能作文批改与润色",
  description: "专业的AI作文批改专家，融合文学大师风格，为学生提供深度点评、创意建议和个性化指导",
  generator: "v0.app",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "沈翔学校",
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
        {/* 🚀 DNS 预解析 - 提前解析 CDN 域名，减少首屏延迟 */}
        <link rel="dns-prefetch" href="//cdn.shenxiang.school" />
        <link rel="preconnect" href="https://cdn.shenxiang.school" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="//cdn.authing.co" />
        <link rel="preconnect" href="https://cdn.authing.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="//rnujdnmxufmzgjvmddla.supabase.co" />
        <link rel="preconnect" href="https://rnujdnmxufmzgjvmddla.supabase.co" crossOrigin="anonymous" />
        
        {/* Authing CSS 由登录页自行动态加载（guard-react 组件内部加载），无需全局同步引入 */}
        {/* PWA Apple 图标 - 使用 CDN */}
        <link rel="apple-touch-icon" href="https://cdn.shenxiang.school/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="https://cdn.shenxiang.school/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="https://cdn.shenxiang.school/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="https://cdn.shenxiang.school/icons/icon-192x192.png" />

        {/* KaTeX CSS - 同步加载，确保公式排版正确 */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.45/dist/katex.min.css" />
      </head>
      <body className={`font-sans antialiased`}>
        {/* ✅ WxGuard 放在最上方，确保它是 body 的第一个子元素 */}
        <WxGuard />

        <SidebarProvider>
          <AppSidebar />
          <div className="flex flex-1 w-full flex-col min-h-screen">
            {children}
          </div>
        </SidebarProvider>
        
        {/* PWA 安装提示 */}
        <InstallPrompt />
        
      </body>
    </html>
  )
}
