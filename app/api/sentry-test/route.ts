// Sentry 测试 API - 触发后删除
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

export async function GET() {
  // 捕获一个测试错误
  Sentry.captureException(new Error('Sentry 测试错误 - 验证监控是否工作'));

  return NextResponse.json({
    success: true,
    message: '测试错误已发送，请检查 Sentry Dashboard'
  });
}
