// sentry.client.config.ts
// Sentry 客户端配置（浏览器端）

import * as Sentry from '@sentry/nextjs';

function isUsableSentryDsn(value: string | undefined) {
  if (!value) return false

  const normalized = value.trim().toLowerCase()
  const placeholderTokens = ['example', 'placeholder', 'your_', 'your-', 'sentry_dsn', 'o0.ingest.sentry.io']
  if (placeholderTokens.some((token) => normalized.includes(token))) return false

  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && parsed.username.length > 0 && parsed.hostname.length > 0
  } catch {
    return false
  }
}

// 客户端只能读取 NEXT_PUBLIC_ 前缀的公开 DSN。
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (!isUsableSentryDsn(dsn)) {
  // DSN 未配置或仍为占位符，跳过 Sentry 初始化
  if (process.env.NODE_ENV === 'development') {
    console.log('[Sentry] DSN not configured, skipping initialization')
  }
} else {
  Sentry.init({
    dsn: dsn,
    
    // 环境
    environment: process.env.NODE_ENV,
    
    // 性能监控采样率（0.0 - 1.0）
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Session Replay（可选，用于重现用户操作）
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    
    // 调试模式（开发环境开启）
    debug: process.env.NODE_ENV === 'development',
    
    // 忽略的错误类型
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'NetworkError',
      'ChunkLoadError',
    ],
    
    // 过滤的 URL
    denyUrls: [
      // 开发工具
      /extensions\//i,
      /^chrome:\/\//i,
      /^file:\/\//i,
    ],
    
    // 隐私设置：不收集用户IP
    sendDefaultPii: false,
    
    // 错误边界配置
    beforeSend(event) {
      // 开发环境直接打印到控制台
      if (process.env.NODE_ENV === 'development') {
        console.error('[Sentry]', event);
        return null; // 不发送到 Sentry
      }
      return event;
    },
  });
}
