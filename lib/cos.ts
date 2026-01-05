/**
 * 腾讯云 COS 存储工具类
 * 
 * 🎯 功能：
 * 1. 将 AI 生成的临时资源（音频、图片、视频）转存至腾讯云 COS
 * 2. 返回 CDN 加速域名的 URL
 * 
 * 📦 存储桶：media-shenxiang-1394034082
 * 🌍 地域：ap-hongkong (中国香港)
 * 🚀 CDN 域名：https://cdn.shenxiang.school
 * 
 * ⚠️ 安全协议：
 * - SecretId 和 SecretKey 必须通过环境变量读取
 * - 严禁硬编码在代码中
 */

import COS from 'cos-nodejs-sdk-v5'
import { randomUUID } from 'crypto'

// ============================================
// 配置
// ============================================

const COS_CONFIG = {
  SecretId: process.env.TENCENT_COS_SECRET_ID || '',
  SecretKey: process.env.TENCENT_COS_SECRET_KEY || '',
  Bucket: process.env.TENCENT_COS_BUCKET || 'media-shenxiang-1394034082',
  Region: process.env.TENCENT_COS_REGION || 'ap-hongkong',
  CdnDomain: process.env.TENCENT_COS_CDN_DOMAIN || 'https://cdn.shenxiang.school',
}

// 创建 COS 实例（延迟初始化）
let cosInstance: COS | null = null

function getCosInstance(): COS | null {
  if (!COS_CONFIG.SecretId || !COS_CONFIG.SecretKey || 
      COS_CONFIG.SecretId === 'your_secret_id_here' ||
      COS_CONFIG.SecretKey === 'your_secret_key_here') {
    console.warn('⚠️ [COS] 未配置腾讯云 COS 密钥，跳过上传')
    return null
  }
  
  if (!cosInstance) {
    cosInstance = new COS({
      SecretId: COS_CONFIG.SecretId,
      SecretKey: COS_CONFIG.SecretKey,
    })
  }
  
  return cosInstance
}

// ============================================
// 类型定义
// ============================================

export type ModelType = 'suno' | 'banana' | 'sora' | 'other'

export interface UploadResult {
  success: boolean
  cdnUrl: string      // CDN 加速 URL
  cosUrl?: string     // COS 原始 URL
  key?: string        // 存储路径
  error?: string
}

// ============================================
// 核心函数：上传文件到 COS
// ============================================

/**
 * 将远程 URL 的文件上传到腾讯云 COS
 * 
 * @param sourceUrl - AI 模型生成的临时链接
 * @param modelName - 模型名称（用于目录组织）
 * @param fileExtension - 文件扩展名（如 mp3, png, mp4）
 * @returns 上传结果，包含 CDN 加速 URL
 * 
 * @example
 * const result = await uploadToCos(
 *   'http://ai-server.com/temp/audio.mp3',
 *   'suno',
 *   'mp3'
 * )
 * // result.cdnUrl = 'https://cdn.shenxiang.school/ai-generated/suno/2026-01-05/xxx.mp3'
 */
export async function uploadToCos(
  sourceUrl: string,
  modelName: ModelType,
  fileExtension?: string
): Promise<UploadResult> {
  console.log('📤 [COS] 开始上传:', { sourceUrl: sourceUrl.slice(0, 80), modelName })
  
  // 检查 COS 实例
  const cos = getCosInstance()
  if (!cos) {
    console.log('⚠️ [COS] 未配置密钥，返回原始 URL')
    return {
      success: false,
      cdnUrl: sourceUrl,
      error: 'COS 未配置',
    }
  }
  
  try {
    // 1. 从远程 URL 下载文件
    console.log('📥 [COS] 下载远程文件...')
    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ShenxiangBot/1.0)',
      },
    })
    
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status} ${response.statusText}`)
    }
    
    const buffer = Buffer.from(await response.arrayBuffer())
    console.log('✅ [COS] 下载完成，大小:', (buffer.length / 1024).toFixed(2), 'KB')
    
    // 2. 生成存储路径
    const date = new Date().toISOString().split('T')[0] // 2026-01-05
    const uuid = randomUUID()
    const ext = fileExtension || guessExtension(sourceUrl, response.headers.get('content-type'))
    const key = `ai-generated/${modelName}/${date}/${uuid}.${ext}`
    
    console.log('📁 [COS] 存储路径:', key)
    
    // 3. 上传到 COS
    const uploadResult = await new Promise<COS.PutObjectResult>((resolve, reject) => {
      cos.putObject({
        Bucket: COS_CONFIG.Bucket,
        Region: COS_CONFIG.Region,
        Key: key,
        Body: buffer,
        ContentLength: buffer.length,
      }, (err, data) => {
        if (err) {
          reject(err)
        } else {
          resolve(data)
        }
      })
    })
    
    console.log('✅ [COS] 上传成功:', uploadResult.Location)
    
    // 4. 构建 CDN URL
    const cdnUrl = `${COS_CONFIG.CdnDomain}/${key}`
    const cosUrl = `https://${uploadResult.Location}`
    
    console.log('🚀 [COS] CDN URL:', cdnUrl)
    
    return {
      success: true,
      cdnUrl,
      cosUrl,
      key,
    }
    
  } catch (error: any) {
    console.error('❌ [COS] 上传失败:', error.message || error)
    
    // 🔥 错误处理：fallback 回原始链接
    return {
      success: false,
      cdnUrl: sourceUrl, // 返回原始 URL，确保业务不中断
      error: error.message || '上传失败',
    }
  }
}

// ============================================
// 批量上传
// ============================================

/**
 * 批量上传多个文件到 COS
 * 
 * @param files - 文件列表 [{url, modelName, ext}]
 * @returns 上传结果列表
 */
export async function uploadMultipleToCos(
  files: Array<{
    url: string
    modelName: ModelType
    ext?: string
  }>
): Promise<UploadResult[]> {
  console.log('📤 [COS] 批量上传:', files.length, '个文件')
  
  const results = await Promise.all(
    files.map(file => uploadToCos(file.url, file.modelName, file.ext))
  )
  
  const successCount = results.filter(r => r.success).length
  console.log('✅ [COS] 批量上传完成:', successCount, '/', files.length, '成功')
  
  return results
}

// ============================================
// 辅助函数
// ============================================

/**
 * 根据 URL 或 Content-Type 猜测文件扩展名
 */
function guessExtension(url: string, contentType: string | null): string {
  // 从 URL 提取
  const urlMatch = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
  if (urlMatch) {
    return urlMatch[1].toLowerCase()
  }
  
  // 从 Content-Type 推断
  if (contentType) {
    const typeMap: Record<string, string> = {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
    }
    
    for (const [type, ext] of Object.entries(typeMap)) {
      if (contentType.includes(type)) {
        return ext
      }
    }
  }
  
  // 默认
  return 'bin'
}

/**
 * 检查 URL 是否已经是我们的 CDN 域名
 */
export function isCdnUrl(url: string): boolean {
  return url.startsWith(COS_CONFIG.CdnDomain)
}

/**
 * 检查 COS 是否已配置
 */
export function isCosConfigured(): boolean {
  return !!(
    COS_CONFIG.SecretId && 
    COS_CONFIG.SecretKey && 
    COS_CONFIG.SecretId !== 'your_secret_id_here' &&
    COS_CONFIG.SecretKey !== 'your_secret_key_here'
  )
}
