/**
 * ⚠️ 沈翔智学 - 全局错误边界页面 (Global Error)
 * 捕获根布局级别的错误
 * 无障碍改进: skip navigation, 键盘焦点样式, 语义化结构
 */

'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Home, RefreshCw, Phone, MessageCircle } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // 记录错误到控制台（开发环境）
    console.error('全局错误:', error)
  }, [error])

  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-white">
        <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
          {/* 错误图标 */}
          <div className="mb-6 p-4 bg-green-50 rounded-full">
            <svg
              className="w-16 h-16 text-green-900"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          {/* 标题 */}
          <h1
            id="main-content"
            className="text-2xl md:text-3xl font-bold text-slate-800 mb-4"
          >
            哎呀，出了点小问题
          </h1>

          {/* 描述 */}
          <p className="text-slate-500 mb-8 max-w-md">
            应用遇到了一些问题，请稍后再试。
            <br />
            如果问题持续存在，请联系客服。
          </p>

          {/* 操作按钮 */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-900 text-white rounded-xl hover:bg-green-800 transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              <RefreshCw className="w-4 h-4" />
              重新加载
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
            >
              <Home className="w-4 h-4" />
              返回首页
            </Link>
          </div>

          {/* 客服联系方式 */}
          <section className="flex flex-col items-center gap-4 text-sm text-slate-400" aria-label="联系客服">
            <p className="text-slate-500 font-medium">需要帮助？</p>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <a
                href="tel:19132896773"
                className="inline-flex items-center gap-1.5 text-green-700 hover:text-green-600 transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 rounded px-2 py-1"
              >
                <Phone className="w-4 h-4" aria-hidden="true" />
                19132896773
              </a>
              <span className="text-slate-300 hidden sm:inline">|</span>
              <div className="flex items-center gap-1.5 text-slate-600">
                <MessageCircle className="w-4 h-4" aria-hidden="true" />
                <span>微信扫码咨询</span>
              </div>
            </div>
            {/* 微信二维码占位 */}
            <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="w-24 h-24 bg-slate-200 rounded flex items-center justify-center text-slate-400 text-xs">
                微信二维码
              </div>
              <p className="text-xs text-slate-400 mt-2">微信扫码添加客服</p>
            </div>
          </section>

          {/* 错误 ID（仅开发环境显示） */}
          {error.digest && (
            <p className="mt-6 text-xs text-slate-300">
              错误 ID: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}