/**
 * 🔍 沈翔学校 - 404 页面 (Not Found)
 * 
 * 当用户访问不存在的页面时显示。
 */

'use client'

import Link from "next/link"
import { Home, ArrowLeft, Search, MessageSquare } from "lucide-react"

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center bg-white">
      {/* 大数字 */}
      <div className="text-[120px] md:text-[180px] font-bold text-green-100 leading-none select-none">
        404
      </div>

      {/* 标题 */}
      <h1 className="text-2xl md:text-3xl font-bold text-slate-800 -mt-6 mb-4">
        页面不存在
      </h1>

      {/* 描述 */}
      <p className="text-slate-500 mb-8 max-w-md">
        您访问的页面可能已被删除、移动或从未存在。
        <br />
        请检查网址是否正确，或返回首页。
      </p>

      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-900 text-white rounded-xl hover:bg-green-800 transition-colors font-medium"
        >
          <Home className="w-4 h-4" />
          回到首页
        </Link>
        <button
          onClick={() => typeof window !== 'undefined' && window.history.back()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          返回上页
        </button>
      </div>

      {/* 快捷链接 */}
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-slate-400">或者尝试以下链接：</p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-green-700 transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            开始对话
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-green-700 transition-colors"
          >
            <Search className="w-4 h-4" />
            查看价格
          </Link>
        </div>
      </div>
    </div>
  )
}
