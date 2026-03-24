/**
 * 📤 通用上传服务 (Universal Upload Service)
 * 
 * 🎯 功能：
 * 1. 大文件直连 Lighthouse 服务器，绕过 Vercel 4.5MB 限制
 * 2. 根据不同应用动态获取对应的 API Key
 * 3. 全局统一的上传入口
 * 
 * 🔧 使用方式：
 * import { universalUpload } from '@/lib/upload-service'
 * const result = await universalUpload(file, userId, model)
 */


// ============================================
// 配置常量
// ============================================

// Vercel 限制阈值：4MB（略低于 4.5MB 硬限制）
export const VERCEL_FILE_SIZE_LIMIT = 4 * 1024 * 1024

// Lighthouse 服务器直连地址
export const LIGHTHOUSE_UPLOAD_URL = process.env.NEXT_PUBLIC_LIGHTHOUSE_UPLOAD_URL 
  || ""

// ============================================
// 应用 API Key 映射表
// ============================================

/**
 * 🔑 Dify 应用 API Key 映射表
 * 根据不同的模型/应用返回对应的 API Key
 */
export const DIFY_API_KEY_MAP: Record<string, string | undefined> = {
  // 作文批改 - 专用 API Key
  "standard": process.env.NEXT_PUBLIC_ESSAY_CORRECTION_API_KEY || process.env.NEXT_PUBLIC_DIFY_API_KEY,
  
  // 教学评助手
  "teaching-pro": process.env.NEXT_PUBLIC_DIFY_TEACHING_PRO_API_KEY || process.env.NEXT_PUBLIC_DIFY_API_KEY,
  
  // 通用模型
  "gpt-5": process.env.NEXT_PUBLIC_DIFY_API_KEY_GPT5 || process.env.NEXT_PUBLIC_DIFY_API_KEY,
  "claude-opus": process.env.NEXT_PUBLIC_DIFY_API_KEY_CLAUDE || process.env.NEXT_PUBLIC_DIFY_API_KEY,
  "gemini-pro": process.env.NEXT_PUBLIC_DIFY_API_KEY_GEMINI || process.env.NEXT_PUBLIC_DIFY_API_KEY,
  
  // 创意生成
  "banana": process.env.NEXT_PUBLIC_DIFY_BANANA_API_KEY || process.env.NEXT_PUBLIC_DIFY_API_KEY,
  "banana-2-pro": process.env.NEXT_PUBLIC_DIFY_BANANA_API_KEY || process.env.NEXT_PUBLIC_DIFY_API_KEY,
  
  // 音乐和视频
  "suno-v5": process.env.NEXT_PUBLIC_DIFY_API_KEY || process.env.NEXT_PUBLIC_SUNO_API_KEY,
  "sora-2-pro": process.env.NEXT_PUBLIC_DIFY_API_KEY || process.env.NEXT_PUBLIC_SORA_API_KEY,
}

/**
 * 🔑 获取指定模型的 API Key
 */
export function getApiKeyForModel(model: string | null): string {
  if (!model) {
    return DIFY_API_KEY_MAP["standard"] || ""
  }
  return DIFY_API_KEY_MAP[model] || DIFY_API_KEY_MAP["standard"] || ""
}

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

export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

// ============================================
// 类型定义
// ============================================

export interface UploadResult {
  success: boolean
  fileId?: string
  fileName?: string
  cosUrl?: string
  error?: string
}

export interface UploadOptions {
  userId: string
  model: string
  onProgress?: (progress: number) => void
}

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

/**
 * 🚀 大文件直连 Lighthouse 上传
 * 
 * @param file - 要上传的文件
 * @param userId - 用户 ID
 * @param model - 模型名称
 * @returns 上传结果
 */
export async function uploadToLighthouse(
  file: File, 
  userId: string, 
  model: string = "standard"
): Promise<{ id: string }> {
  const apiKey = getApiKeyForModel(model)
  
  if (!apiKey) {
    throw new Error("未配置 API Key，请联系管理员")
  }
  
  const formData = new FormData()
  formData.append("file", file)
  formData.append("user", userId)
  
  const response = await fetch(LIGHTHOUSE_UPLOAD_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "X-User-Id": userId,
      "X-Model": model
    },
    body: formData
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`大文件上传失败 (${response.status}): ${errorText}`)
  }
  
  const data = await response.json()
  return { id: data.id }
}

// ============================================
// 核心上传函数
// ============================================

/**
 * 🚀 通用上传函数
 * 
 * @param file - 要上传的文件
 * @param options - 上传选项
 * @returns 上传结果
 */
export async function universalUpload(
  file: File, 
  options: UploadOptions
): Promise<UploadResult> {
  const { userId, model, onProgress } = options
  
  console.log("📤 [Universal Upload] 开始上传:", { 
    fileName: file.name, 
    fileSize: (file.size / 1024 / 1024).toFixed(2) + "MB",
    model,
    userId 
  })
  
  // 1. 安全校验
  const validation = validateFile(file)
  if (!validation.valid) {
    console.warn("📤 [Universal Upload] 安全校验失败:", validation.error)
    return { success: false, error: validation.error }
  }
  
  // 2. 获取对应模型的 API Key
  const apiKey = getApiKeyForModel(model)
  if (!apiKey) {
    console.error("📤 [Universal Upload] 未配置 API Key for model:", model)
    return { success: false, error: "未配置 API Key，请联系管理员" }
  }
  
  // 3. 创建 FormData
  const formData = new FormData()
  formData.append("file", file)
  formData.append("user", userId)
  
  try {
    // 4. 判断是否需要直连
    const shouldUseDirectUpload = file.size > VERCEL_FILE_SIZE_LIMIT
    
    if (shouldUseDirectUpload) {
      // 🔥 大文件直连 Lighthouse
      console.log("📤 [Universal Upload] 大文件直连:", (file.size / 1024 / 1024).toFixed(2) + "MB")
      
      const response = await fetch(LIGHTHOUSE_UPLOAD_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "X-User-Id": userId,
          "X-Model": model
        },
        body: formData
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error("📤 [Universal Upload] 直连失败:", response.status, errorText)
        return { 
          success: false, 
          error: `大文件上传失败 (${response.status})` 
        }
      }
      
      const data = await response.json()
      console.log("📤 [Universal Upload] 直连成功:", data.id)
      
      if (onProgress) onProgress(100)
      
      return {
        success: true,
        fileId: data.id,
        fileName: data.file_name
      }
    } else {
      // ✅ 小文件走 Vercel API
      console.log("📤 [Universal Upload] 小文件走 Vercel:", (file.size / 1024 / 1024).toFixed(2) + "MB")
      
      const response = await fetch("/api/dify-upload", {
        method: "POST",
        headers: {
          "X-User-Id": userId,
          "X-Model": model
        },
        body: formData
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        
        // 如果是 413 错误，尝试降级到直连
        if (response.status === 413 && LIGHTHOUSE_UPLOAD_URL) {
          console.log("📤 [Universal Upload] Vercel 限制，尝试降级到直连...")
          return universalUpload(file, options)
        }
        
        return { 
          success: false, 
          error: errorData.error || `上传失败 (${response.status})` 
        }
      }
      
      const data = await response.json()
      console.log("📤 [Universal Upload] Vercel 成功:", data.id)
      
      if (onProgress) onProgress(100)
      
      return {
        success: true,
        fileId: data.id,
        fileName: data.safeFileName || data.file_name,
        cosUrl: data.cosUrl
      }
    }
  } catch (error) {
    console.error("📤 [Universal Upload] 异常:", error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "上传失败" 
    }
  }
}

// ============================================
// 便捷函数
// ============================================

/**
 * 📤 上传多个文件
 */
export async function uploadMultiple(
  files: File[],
  options: UploadOptions
): Promise<UploadResult[]> {
  const results = await Promise.all(
    files.map((file, index) => 
      universalUpload(file, {
        ...options,
        onProgress: options.onProgress 
          ? (progress) => options.onProgress!(Math.round(((index + 1) / files.length) * 100))
          : undefined
      })
    )
  )
  return results
}
