// sentry.edge.config.ts
// Sentry Edge 配置（Edge Runtime 环境，如 Middleware）

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  // ⚠️ 请替换为真实的 Sentry DSN
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || 'https://examplePublicKey@o0.ingest.sentry.io/0',
  
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