// sentry.server.config.ts
// Sentry 服务端配置（Node.js 环境）

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
    
    // 忽略 404 错误
    ignoreErrors: [
      'NEXT_NOT_FOUND',
      'NEXT_REDIRECT',
    ],
    
    // 上下文信息
    initialScope: {
      tags: {
        component: 'server',
      },
    },
    
    // 过滤隐私信息
    beforeSend(event) {
      // 移除敏感请求头
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-api-key'];
      }
      
      // 移除敏感 cookies
      if (event.request?.cookies) {
        delete event.request.cookies;
      }
      
      return event;
    },
  });
}