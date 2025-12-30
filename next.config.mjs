/**
 * 🚀 沈翔学校 - Next.js 配置（Next.js 16 兼容版）
 */

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
  // 实验性功能
  // ============================================
  experimental: {
    // 优化包导入
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@radix-ui/react-icons',
    ],
  },

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
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
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

export default nextConfig
