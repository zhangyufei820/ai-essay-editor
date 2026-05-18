/**
 * 🛡️ 沈翔学校 - 错误边界组件 (Error Boundary)
 * 
 * 捕获子组件的 JavaScript 错误，显示友好的错误界面。
 */

"use client"

import { Component, ReactNode } from "react"
import { Home } from "lucide-react"
import { brandColors } from "@/lib/design-tokens"
import { IconFollowup, IconHistory, IconInkDot } from "@/components/icons/v2"

// ============================================
// 类型定义
// ============================================

interface ErrorBoundaryProps {
  /** 子组件 */
  children: ReactNode
  /** 自定义错误回退 UI */
  fallback?: ReactNode
  /** 错误回调 */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  /** 是否显示错误详情（开发环境） */
  showDetails?: boolean
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: React.ErrorInfo
}

// ============================================
// 错误边界组件
// ============================================

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("🚨 ErrorBoundary caught an error:", error)
    console.error("📍 Component stack:", errorInfo.componentStack)
    
    this.setState({ errorInfo })
    
    // 调用外部错误回调
    this.props.onError?.(error, errorInfo)
    
    // TODO: 上报错误到监控服务（如 Sentry）
    // reportError(error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
  }

  handleRefresh = () => {
    this.handleReset()
    window.location.reload()
  }

  handleGoHome = () => {
    this.handleReset()
    window.location.href = "/"
  }

  render() {
    if (this.state.hasError) {
      // 使用自定义回退 UI
      if (this.props.fallback) {
        return this.props.fallback
      }

      const isDev = process.env.NODE_ENV === "development"
      const showDetails = this.props.showDetails ?? isDev

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          {/* 错误图标 */}
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-6">
            <IconInkDot className="w-8 h-8 text-[var(--seal-500)]" />
          </div>

          {/* 标题 */}
          <h2 className="text-xl font-semibold text-[var(--ink-800)] mb-2">
            出了点问题
          </h2>

          {/* 描述 */}
          <p className="text-[var(--ink-500)] mb-6 max-w-md">
            页面加载时遇到了错误，请尝试刷新页面。如果问题持续存在，请联系客服。
          </p>

          {/* 操作按钮 */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
            <button
              onClick={this.handleRefresh}
              className="inline-flex items-center gap-2 px-4 py-2 text-white rounded-[var(--radius-sharp)] hover:opacity-90 transition-colors"
              style={{ backgroundColor: brandColors[900] }}
            >
              <IconHistory className="w-4 h-4" />
              刷新页面
            </button>
            <button
              onClick={this.handleGoHome}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--paper-100)] text-[var(--ink-700)] rounded-[var(--radius-sharp)] hover:bg-[var(--paper-200)] transition-colors"
            >
              <Home className="w-4 h-4" />
              回到首页
            </button>
          </div>

          {/* 联系客服 */}
          <a
            href="mailto:support@shenxiang.edu"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-400)] hover:text-[var(--ink-600)] transition-colors"
          >
            <IconFollowup className="w-4 h-4" />
            联系客服
          </a>

          {/* 开发环境显示错误详情 */}
          {showDetails && this.state.error && (
            <details className="mt-8 w-full max-w-2xl text-left">
              <summary className="cursor-pointer text-sm text-[var(--ink-400)] hover:text-[var(--ink-600)]">
                查看错误详情（开发模式）
              </summary>
              <div className="mt-4 p-4 bg-[var(--paper-50)] rounded-[var(--radius-sharp)] overflow-auto">
                <p className="text-sm font-mono text-[var(--seal-600)] mb-2">
                  {this.state.error.name}: {this.state.error.message}
                </p>
                {this.state.error.stack && (
                  <pre className="text-xs font-mono text-[var(--ink-500)] whitespace-pre-wrap">
                    {this.state.error.stack}
                  </pre>
                )}
                {this.state.errorInfo?.componentStack && (
                  <pre className="mt-4 text-xs font-mono text-[var(--ink-400)] whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            </details>
          )}
        </div>
      )
    }

    return this.props.children
  }
}

// ============================================
// 默认导出
// ============================================

export default ErrorBoundary
