"use client"

import { X } from "lucide-react"
import { useState } from "react"

export function BetaBanner() {
  const [isVisible, setIsVisible] = useState(true)

  if (!isVisible) return null

  return (
    <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3 px-4 relative">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="bg-white text-emerald-600 px-3 py-1 rounded-full text-sm font-semibold">公测中</span>
          <p className="text-sm md:text-base">
            🎉 欢迎参与公测！目前支持邮箱注册、AI批改、文件上传等核心功能。
            <span className="hidden md:inline">更多支付和登录方式即将上线！</span>
          </p>
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="text-white hover:text-emerald-100 transition-colors"
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
