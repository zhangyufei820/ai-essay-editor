// sentry.edge.config.ts
// Sentry Edge 配置（Edge Runtime 环境，如 Middleware）

import * as Sentry from '@sentry/nextjs';

// 检查 DSN 是否配置
const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
if (!dsn || dsn.includes('examplePublicKey') || dsn.includes('o0.ingest.sentry.io')) {
  // DSN 未配置或仍为占位符，跳过 Sentry 初始化
  if (process.env.NODE_ENV === 'development') {
    console.log('[Sentry] DSN not configured, skipping initialization')
  }
} else {
  Sentry.init({
    // ⚠️ 请替换为真实的 Sentry DSN
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