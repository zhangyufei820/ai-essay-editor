/**
 * 📲 沈翔学校 - PWA 安装提示组件 (Install Prompt)
 * 
 * 提示用户将应用安装到主屏幕。
 */

"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Smartphone, Share, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { brandColors } from "@/lib/design-tokens"
import { IconExportPdf } from "@/components/icons/v2"

// ============================================
// 类型定义
// ============================================

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

// ============================================
// 检测设备类型
// ============================================

function getDeviceInfo() {
  if (typeof window === "undefined") {
    return { isIOS: false, isAndroid: false, isStandalone: false }
  }

  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream
  const isAndroid = /Android/.test(ua)
  const isStandalone = 
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true

  return { isIOS, isAndroid, isStandalone }
}

// ============================================
// 安装提示组件
// ============================================

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // 检查是否已经安装或已经关闭过
    const hasInstalled = localStorage.getItem("pwa-installed")
    const hasDismissed = localStorage.getItem("pwa-dismissed")
    
    if (hasInstalled || hasDismissed) {
      return
    }

    const { isIOS, isStandalone } = getDeviceInfo()

    // 已经是 standalone 模式，不显示
    if (isStandalone) {
      localStorage.setItem("pwa-installed", "true")
      return
    }

    // Android/Chrome 的安装提示
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      
      // 延迟显示，避免打扰用户
      setTimeout(() => {
        setShowPrompt(true)
      }, 5000)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstall)

    // iOS 设备显示手动安装指南
    if (isIOS) {
      setTimeout(() => {
        setShowIOSGuide(true)
      }, 10000)
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall)
    }
  }, [])

  // 处理安装
  const handleInstall = async () => {
    if (!deferredPrompt) return

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      
      if (outcome === "accepted") {
        localStorage.setItem("pwa-installed", "true")
        setDeferredPrompt(null)
      }
    } catch (error) {
      console.error("安装失败:", error)
    }
    
    setShowPrompt(false)
  }

  // 关闭提示
  const handleDismiss = () => {
    setShowPrompt(false)
    setShowIOSGuide(false)
    setDismissed(true)
    localStorage.setItem("pwa-dismissed", Date.now().toString())
  }

  // 稍后提醒
  const handleLater = () => {
    setShowPrompt(false)
    setShowIOSGuide(false)
    // 24小时后再次提醒
    localStorage.setItem("pwa-dismissed", (Date.now() - 23 * 60 * 60 * 1000).toString())
  }

  if (dismissed) return null

  return (
    <>
      {/* Android/Chrome 安装提示 */}
      <AnimatePresence>
        {showPrompt && deferredPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-[var(--paper-50)] rounded-[var(--radius-sharp)] shadow-xl border border-[var(--paper-100)] p-4 z-50"
          >
            <div className="flex items-start gap-3">
              <div 
                className="w-10 h-10 rounded-[var(--radius-sharp)] flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${brandColors[50]}` }}
              >
                <IconExportPdf className="w-5 h-5" style={{ color: brandColors[700] }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[var(--ink-800)] text-sm">
                  安装沈翔学校
                </h3>
                <p className="text-xs text-[var(--ink-500)] mt-1">
                  添加到主屏幕，获得更好的体验
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleInstall}
                    className="px-3 py-1.5 text-xs font-medium text-white rounded-[var(--radius-soft)] hover:opacity-90 transition-colors"
                    style={{ backgroundColor: brandColors[900] }}
                  >
                    安装
                  </button>
                  <button
                    onClick={handleLater}
                    className="px-3 py-1.5 text-xs font-medium text-[var(--ink-600)] bg-[var(--paper-100)] rounded-[var(--radius-soft)] hover:bg-[var(--paper-200)] transition-colors"
                  >
                    稍后再说
                  </button>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="text-[var(--ink-400)] hover:text-[var(--ink-600)] p-1 -mr-1 -mt-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS 安装指南 */}
      <AnimatePresence>
        {showIOSGuide && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-[var(--paper-50)] rounded-[var(--radius-sharp)] shadow-xl border border-[var(--paper-100)] p-4 z-50"
          >
            <div className="flex items-start gap-3">
              <div 
                className="w-10 h-10 rounded-[var(--radius-sharp)] flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${brandColors[50]}` }}
              >
                <Smartphone className="w-5 h-5" style={{ color: brandColors[700] }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[var(--ink-800)] text-sm">
                  添加到主屏幕
                </h3>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-[var(--ink-600)]">
                    <span className="w-5 h-5 rounded bg-[var(--paper-100)] flex items-center justify-center text-[10px] font-medium">1</span>
                    <span>点击底部</span>
                    <Share className="w-4 h-4 text-blue-500" />
                    <span>分享按钮</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--ink-600)]">
                    <span className="w-5 h-5 rounded bg-[var(--paper-100)] flex items-center justify-center text-[10px] font-medium">2</span>
                    <span>选择</span>
                    <Plus className="w-4 h-4 text-[var(--ink-500)]" />
                    <span>添加到主屏幕</span>
                  </div>
                </div>
                <button
                  onClick={handleLater}
                  className="mt-3 px-3 py-1.5 text-xs font-medium text-[var(--ink-600)] bg-[var(--paper-100)] rounded-[var(--radius-soft)] hover:bg-[var(--paper-200)] transition-colors"
                >
                  知道了
                </button>
              </div>
              <button
                onClick={handleDismiss}
                className="text-[var(--ink-400)] hover:text-[var(--ink-600)] p-1 -mr-1 -mt-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ============================================
// 默认导出
// ============================================

export default InstallPrompt
