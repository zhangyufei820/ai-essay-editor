/**
 * 🔍 沈翔智学 - 404 页面 (Not Found)
 * 无障碍改进: skip navigation, 键盘焦点样式, 语义化结构
 */

'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Home, ArrowLeft, Search, MessageSquare, Phone, ArrowRight } from 'lucide-react'

// 热门链接配置
const POPULAR_LINKS = [
  { href: '/chat', label: 'AI 对话', icon: MessageSquare, desc: 'GPT·Claude·Gemini' },
  { href: '/essay', label: '作文批改', icon: Search, desc: 'AI 专业点评' },
  { href: '/pricing', label: '价格方案', icon: Search, desc: '了解会员权益' },
]

export default function NotFound() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/chat/standard?query=${encodeURIComponent(searchQuery.trim())}`)
    }
  }, [searchQuery, router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center bg-white">
      {/* 大数字 */}
      <div className="text-[120px] md:text-[180px] font-bold text-green-100 leading-none select-none">
        404
      </div>

      {/* 标题 */}
      <h1
        id="main-content"
        className="text-2xl md:text-3xl font-bold text-slate-800 -mt-6 mb-4"
      >
        页面不存在
      </h1>

      {/* 描述 */}
      <p className="text-slate-500 mb-6 max-w-md">
        您访问的页面可能已被删除、移动或从未存在。
        <br />
        请检查网址是否正确，或返回首页。
      </p>

      {/* 搜索框 - WCAG: 有标签、键盘可用 */}
      <form
        onSubmit={handleSearch}
        className="w-full max-w-md flex gap-2 mb-8"
        role="search"
      >
        <label htmlFor="page-search" className="sr-only">
          搜索页面内容
        </label>
        <input
          id="page-search"
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索功能..."
          className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-shadow"
          aria-label="搜索页面"
        />
        <button
          type="submit"
          className="px-4 py-2.5 bg-green-900 text-white rounded-xl hover:bg-green-800 transition-colors font-medium text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          aria-label="搜索"
        >
          <Search className="w-4 h-4" />
        </button>
      </form>

      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-900 text-white rounded-xl hover:bg-green-800 transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
        >
          <Home className="w-4 h-4" />
          回到首页
        </Link>
        <button
          onClick={() => typeof window !== 'undefined' && window.history.back()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
        >
          <ArrowLeft className="w-4 h-4" />
          返回上页
        </button>
      </div>

      {/* 热门推荐 */}
      <section className="w-full max-w-2xl mb-10" aria-label="热门功能">
        <p className="text-sm text-slate-400 mb-4 font-medium">热门功能</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {POPULAR_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 hover:border-green-300 hover:bg-green-50/50 transition-all text-center focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <link.icon className="w-5 h-5 text-green-700 group-hover:scale-110 transition-transform" aria-hidden="true" />
              <span className="text-sm font-medium text-slate-700">{link.label}</span>
              <span className="text-xs text-slate-400">{link.desc}</span>
              <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-green-500 group-hover:translate-x-1 transition-all" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      {/* 客服联系方式 */}
      <section className="flex flex-col items-center gap-2 text-sm text-slate-400" aria-label="联系客服">
        <p>遇到问题？</p>
        <a
          href="tel:19132896773"
          className="inline-flex items-center gap-1.5 text-green-700 hover:text-green-600 transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 rounded px-2 py-1"
        >
          <Phone className="w-4 h-4" aria-hidden="true" />
          19132896773
        </a>
      </section>
    </div>
  )
}
