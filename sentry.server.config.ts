import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  tracesSampleRate: 0.1,

  environment: process.env.NODE_ENV,

  initialScope: {
    tags: {
      service: 'ai-essay-editor',
    },
  },

  // 服务器端过滤
  ignoreErrors: [
    'Failed to fetch',
    'Network request failed',
  ],
});
