/**
 * 🚀 沈翔学校 - Next.js 配置（Next.js 16 兼容版）
 */

import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ============================================
  // 构建配置
  // ============================================
  typescript: {
    ignoreBuildErrors: true,
  },
  output: 'standalone',

  // ============================================
  // Edge Middleware body size limit (default 10MB)
  // 解决 /api/dify-upload 等大文件上传 10MB 限制问题
  // ============================================
  middlewareClientMaxBodySize: '100mb',

  // ============================================
  // API 配置：允许大文件上传（服务器自托管，无 Vercel 限制）
  // ============================================
  experimental: {
    // Next.js 16 proxy 会将请求 body 缓冲到内存，默认 10MB
    // 设为 100MB 以支持大文件上传
    proxyClientMaxBodySize: '100mb',
    // 优化包导入
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@radix-ui/react-icons',
    ],
  },

  // ============================================
  // 图片优化配置
  // ============================================
  images: {
    // 启用图片优化（生产环境）
    unoptimized: process.env.NODE_ENV === 'development',
    // 支持的图片格式
    formats: ['image/avif', 'image/webp'],
    // 远程图片域名白名单
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '**.wx.qq.com',
      },
      {
        protocol: 'https',
        hostname: 'api.shenxiang.school',
      },
    ],
    // 设备尺寸断点
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    // 图片尺寸断点
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // ============================================
  // 性能优化
  // ============================================

  // 压缩配置
  compress: true,

  // 生产环境移除 console.log
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // ============================================
  // Turbopack 配置（Next.js 16 默认使用）
  // ============================================
  turbopack: {},

  // ============================================
  // 重定向和重写
  // ============================================
  async redirects() {
    return [
      // 旧路径重定向
      {
        source: '/home',
        destination: '/',
        permanent: true,
      },
    ]
  },

  // ============================================
  // 安全头
  // ============================================
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdn.authing.co https://cdn.shenxiang.school https://rnujdnmxufmzgjvmddla.supabase.co; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https: blob:; connect-src 'self' https://rnujdnmxufmzgjvmddla.supabase.co https://api.xunhupay.com https://cdn.shenxiang.school wss:; font-src 'self' data:; frame-ancestors 'none'",
          },
        ],
      },
      // 静态资源缓存
      {
        source: '/icons/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  // Sentry Webpack Plugin 配置
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
  silent: true,
  // 在生产环境上传 sourcemap
  widenClientFileUpload: true,
  // 在生产环境自动删除 console
  transpileClientSDK: true,
  // 自动 treeshake Sentry 导入
  automaticVercelMonitors: true,
}, {
  // 报告所有 metadata 项以获得更好的调试
  tunnelRoute: '/monitoring',
  // 禁用 Sentry CLI 在构建时上传 sourcemap（可选，根据需要启用）
  // dryRun: process.env.NODE_ENV === 'development',
});
