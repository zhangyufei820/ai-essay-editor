import type React from "react"
import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { InstallPrompt } from "@/components/pwa/InstallPrompt"
// ✅ 引入刚才新建的微信拦截组件
import WxGuard from "@/components/WxGuard"

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
        <link
          rel="stylesheet"
          href="https://cdn.authing.co/packages/guard-react/latest/guard.min.css"
        />
        {/* PWA Apple 图标 */}
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon-192x192.png" />
      </head>
      <body className={`font-sans antialiased`}>
        {/* ✅ WxGuard 放在最上方，确保它是 body 的第一个子元素 */}
        <WxGuard />

        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <div className="flex flex-1 flex-col">{children}</div>
          </SidebarInset>
        </SidebarProvider>
        
        {/* PWA 安装提示 */}
        <InstallPrompt />
        
        <Analytics />
      </body>
    </html>
  )
}
