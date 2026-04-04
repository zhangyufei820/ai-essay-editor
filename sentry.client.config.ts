import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 采样率：生产环境 10% 足够了
  tracesSampleRate: 0.1,

  // 错误录制：用户遇到错误时自动录制 session replay
  replaysOnErrorSampleRate: 1.0,

  // 开启 Session Replay（可选，对调试很有用）
  replaysSessionSampleRate: 0.1,

  // 环境
  environment: process.env.NODE_ENV,

  // 标签：方便筛选
  initialScope: {
    tags: {
      service: 'ai-essay-editor',
    },
  },

  // 过滤不需要捕获的日志
  ignoreErrors: [
    // 网络相关
    'Failed to fetch',
    'Network request failed',
    // 浏览器扩展
    'Extension context invalidated',
  ],
});
