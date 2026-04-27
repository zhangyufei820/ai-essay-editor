/**
 * 🚀 沈翔学校 - Next.js 配置（Next.js 16 兼容版）
 */

import { withSentryConfig } from '@sentry/nextjs';

const deploymentVersion = process.env.DEPLOYMENT_VERSION || process.env.NEXT_BUILD_ID;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ============================================
  // 构建配置
  // ============================================
  typescript: {
    ignoreBuildErrors: true,
  },
  output: 'standalone',
  ...(deploymentVersion
    ? {
        deploymentId: deploymentVersion,
        generateBuildId: async () => deploymentVersion,
      }
    : {}),

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
    // 让仍走 /_next/image 的优化结果在服务端缓存更久，CDN 侧由 headers() 继续兜底。
    minimumCacheTTL: 31536000,
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
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.authing.co https://cdn.shenxiang.school https://rnujdnmxufmzgjvmddla.supabase.co https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.authing.co; img-src 'self' data: https: blob:; object-src 'self' https:; connect-src 'self' https://core.authing.cn https://*.authing.cn https://rnujdnmxufmzgjvmddla.supabase.co https://api.xunhupay.com https://cdn.shenxiang.school https://files.authing.co https://api.shenxiang.school wss:; font-src 'self' data: https://cdn.jsdelivr.net; frame-ancestors 'none'",
          },
        ],
      },
      // 静态资源缓存
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/icons/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Next 图片优化接口没有文件扩展名，Cloudflare 默认不一定按静态资源处理。
      // 这里给 CDN 明确的边缘缓存信号；本地营销图会尽量直接走 /images 静态路径。
      {
        source: '/_next/image',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'CDN-Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'Cloudflare-CDN-Cache-Control',
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
