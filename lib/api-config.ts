/**
 * API 配置
 * 统一管理 API Base URL
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || ''

/**
 * 获取完整的 API URL
 */
export function getApiUrl(path: string): string {
  if (path.startsWith('http')) {
    return path
  }
  return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

/**
 * 判断是否使用绝对路径
 */
export function isAbsoluteUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}