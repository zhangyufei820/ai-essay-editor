/**
 * 📤 通用上传服务 (Universal Upload Service)
 *
 * 🎯 功能：
 * 1. 大文件直传到服务器，绕过 Vercel 限制
 * 2. 全局统一的上传入口
 *
 * 🔧 使用方式：
 * import { universalUpload } from '@/lib/upload-service'
 * const result = await universalUpload(file, userId, model)
 */


// ============================================
// 配置常量
// ============================================

// 文件大小限制：100MB
export const FILE_SIZE_LIMIT = 100 * 1024 * 1024

// Lighthouse 直连地址（暂保留，所有文件统一走 /api/dify-upload）
export const LIGHTHOUSE_UPLOAD_URL = process.env.NEXT_PUBLIC_LIGHTHOUSE_UPLOAD_URL || ""

// 文件上传服务器地址（服务端使用，不暴露给客户端）
export const UPLOAD_URL = process.env.UPLOAD_URL || ""

// ============================================
// 允许的文件类型
// ============================================

export const ALLOWED_FILE_TYPES = [
  "image/jpeg", 
  "image/png", 
  "image/gif", 
  "image/webp",
  "application/pdf", 
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]

export const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

// ============================================
// 安全校验函数
// ============================================

/**
 * ✅ 安全校验：验证文件类型
 */
export function validateFileType(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return { 
      valid: false, 
      error: `不支持的文件格式: ${file.type || '未知类型'}` 
    }
  }
  return { valid: true }
}

/**
 * ✅ 安全校验：验证文件大小
 */
export function validateFileSize(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { 
      valid: false, 
      error: `文件超过 ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB 限制` 
    }
  }
  return { valid: true }
}

/**
 * ✅ 安全校验：完整校验
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  const typeCheck = validateFileType(file)
  if (!typeCheck.valid) return typeCheck
  
  const sizeCheck = validateFileSize(file)
  if (!sizeCheck.valid) return sizeCheck
  
  return { valid: true }
}

/**
 * ✅ 前端安全校验（validateFile 的别名，用于兼容旧代码）
 */
export function validateFileForUpload(file: File): { valid: boolean; error?: string } {
  return validateFile(file)
}
