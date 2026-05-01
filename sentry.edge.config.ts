// sentry.edge.config.ts
// Sentry Edge 配置（Edge Runtime 环境，如 Middleware）

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

const dsn = process.env.SENTRY_DSN;
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
    
    // 性能监控采样率
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // 调试模式
    debug: process.env.NODE_ENV === 'development',
    
    // 上下文信息
    initialScope: {
      tags: {
        component: 'edge',
      },
    },
    
    // Edge 环境通常不需要发送 PII
    sendDefaultPii: false,
  });
}
