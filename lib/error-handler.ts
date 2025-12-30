/**
 * 🚨 沈翔学校 - API 错误处理工具 (Error Handler)
 * 
 * 统一的 API 错误处理和用户友好提示。
 */

import { toast } from "sonner"

// ============================================
// 类型定义
// ============================================

export interface ApiError {
  status?: number
  code?: string
  message?: string
  details?: any
}

export interface ErrorHandlerOptions {
  /** 是否显示 Toast */
  showToast?: boolean
  /** 自定义错误消息 */
  customMessage?: string
  /** 登录跳转路径 */
  loginPath?: string
  /** 错误回调 */
  onError?: (error: ApiError) => void
  /** 重试回调 */
  onRetry?: () => void
}

// ============================================
// 错误消息映射
// ============================================

const errorMessages: Record<number, string> = {
  400: "请求参数有误",
  401: "请先登录",
  403: "没有权限执行此操作",
  404: "请求的资源不存在",
  408: "请求超时，请稍后重试",
  409: "操作冲突，请刷新后重试",
  413: "文件太大，请压缩后重试",
  422: "数据验证失败",
  429: "请求过于频繁，请稍后再试",
  500: "服务器开小差了，请稍后再试",
  502: "网关错误，请稍后再试",
  503: "服务暂时不可用，请稍后再试",
  504: "网关超时，请稍后再试"
}

const errorCodes: Record<string, string> = {
  NETWORK_ERROR: "网络连接失败，请检查网络",
  TIMEOUT: "请求超时，请稍后重试",
  INSUFFICIENT_CREDITS: "积分不足，请充值",
  RATE_LIMITED: "请求过于频繁，请稍后再试",
  INVALID_TOKEN: "登录已过期，请重新登录",
  FILE_TOO_LARGE: "文件太大，请压缩后重试",
  UNSUPPORTED_FORMAT: "不支持的文件格式"
}

// ============================================
// 错误处理函数
// ============================================

/**
 * 处理 API 错误并显示友好提示
 */
export function handleApiError(
  error: any,
  options: ErrorHandlerOptions = {}
): void {
  const {
    showToast = true,
    customMessage,
    loginPath = "/login",
    onError,
    onRetry
  } = options

  // 解析错误
  const apiError = parseError(error)
  
  // 调用错误回调
  onError?.(apiError)

  // 不显示 Toast 则直接返回
  if (!showToast) return

  // 获取错误消息
  const message = customMessage || getErrorMessage(apiError)

  // 根据状态码处理
  switch (apiError.status) {
    case 401:
      toast.error(message, {
        action: {
          label: "去登录",
          onClick: () => {
            if (typeof window !== "undefined") {
              window.location.href = loginPath
            }
          }
        }
      })
      break

    case 402:
      toast.error("积分不足", {
        description: "请充值后继续使用",
        action: {
          label: "去充值",
          onClick: () => {
            if (typeof window !== "undefined") {
              window.location.href = "/pricing"
            }
          }
        }
      })
      break

    case 429:
      toast.error(message, {
        description: "请等待几秒后重试"
      })
      break

    case 500:
    case 502:
    case 503:
    case 504:
      toast.error(message, {
        action: onRetry ? {
          label: "重试",
          onClick: onRetry
        } : undefined
      })
      break

    default:
      toast.error(message)
  }
}

/**
 * 解析错误对象
 */
export function parseError(error: any): ApiError {
  // 已经是 ApiError 格式
  if (error?.status !== undefined) {
    return error as ApiError
  }

  // fetch Response 对象
  if (error instanceof Response) {
    return {
      status: error.status,
      message: error.statusText
    }
  }

  // 网络错误
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return {
      code: "NETWORK_ERROR",
      message: "网络连接失败"
    }
  }

  // 超时错误
  if (error?.name === "AbortError") {
    return {
      code: "TIMEOUT",
      message: "请求超时"
    }
  }

  // 普通 Error 对象
  if (error instanceof Error) {
    return {
      message: error.message
    }
  }

  // 字符串错误
  if (typeof error === "string") {
    return {
      message: error
    }
  }

  // 未知错误
  return {
    message: "发生未知错误"
  }
}

/**
 * 获取用户友好的错误消息
 */
export function getErrorMessage(error: ApiError): string {
  // 优先使用自定义消息
  if (error.message && !error.message.includes("Error")) {
    return error.message
  }

  // 根据错误码获取消息
  if (error.code && errorCodes[error.code]) {
    return errorCodes[error.code]
  }

  // 根据状态码获取消息
  if (error.status && errorMessages[error.status]) {
    return errorMessages[error.status]
  }

  // 默认消息
  return "请求失败，请稍后重试"
}

// ============================================
// 便捷函数
// ============================================

/**
 * 包装 fetch 请求，自动处理错误
 */
export async function safeFetch<T>(
  url: string,
  options?: RequestInit & { errorOptions?: ErrorHandlerOptions }
): Promise<T | null> {
  const { errorOptions, ...fetchOptions } = options || {}

  try {
    const response = await fetch(url, fetchOptions)

    if (!response.ok) {
      const error: ApiError = {
        status: response.status,
        message: response.statusText
      }

      try {
        const data = await response.json()
        error.message = data.message || data.error || error.message
        error.code = data.code
        error.details = data.details
      } catch {}

      handleApiError(error, errorOptions)
      return null
    }

    return await response.json()
  } catch (error) {
    handleApiError(error, errorOptions)
    return null
  }
}

/**
 * 创建带超时的 fetch
 */
export function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeout = 30000
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => clearTimeout(timeoutId))
}

// ============================================
// 错误上报（可选）
// ============================================

/**
 * 上报错误到监控服务
 */
export function reportError(
  error: Error | ApiError,
  context?: Record<string, any>
): void {
  // TODO: 集成 Sentry 或其他监控服务
  console.error("📊 Error Report:", {
    error,
    context,
    timestamp: new Date().toISOString(),
    url: typeof window !== "undefined" ? window.location.href : undefined,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined
  })
}

// ============================================
// 默认导出
// ============================================

export default {
  handleApiError,
  parseError,
  getErrorMessage,
  safeFetch,
  fetchWithTimeout,
  reportError
}
