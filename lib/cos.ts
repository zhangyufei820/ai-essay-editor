/**
 * 腾讯云 COS 存储工具类
 *
 * 🎯 功能：
 * 1. 将 AI 生成的临时资源（音频、图片、视频）转存至腾讯云 COS
 * 2. 返回 CDN 加速域名的 URL
 * 3. 支持内网 Endpoint（服务器端写）/ 公网 CDN（前端读）
 *
 * 📦 存储桶：media-shenxiang-1394034082
 * 🌍 地域：ap-hongkong (中国香港)
 * 🚀 CDN 域名：https://cdn.shenxiang.school
 * 🔗 内网Endpoint: media-shenxiang-1394034082.cos-internal.ap-hongkong.tencentcos.cn
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

// 🔥 CDN 分发域名（前端读取用）
const CDN_DOMAIN = process.env.NEXT_PUBLIC_CDN_URL
  || process.env.TENCENT_COS_CDN_DOMAIN
  || 'https://cdn.shenxiang.school'

// 🔥 内网 Endpoint（服务器端写/读，避免走公网）
const INTERNAL_ENDPOINT = process.env.TENCENT_COS_INTERNAL_ENDPOINT
  || process.env.TENCENT_COS_ENDPOINT
  || ''

// 🔥 Dify 存储专用 COS 配置（用于 Dify 存储路由）
const DIFY_STORAGE_ENDPOINT = process.env.DIFY_STORAGE_ENDPOINT || ''

const COS_CONFIG = {
  SecretId: process.env.TENCENT_COS_SECRET_ID || '',
  SecretKey: process.env.TENCENT_COS_SECRET_KEY || '',
  Bucket: process.env.TENCENT_COS_BUCKET || 'media-shenxiang-1394034082',
  Region: process.env.TENCENT_COS_REGION || 'ap-hongkong',
  CdnDomain: CDN_DOMAIN,
  InternalEndpoint: INTERNAL_ENDPOINT,
  DifyStorageEndpoint: DIFY_STORAGE_ENDPOINT,
}

// 创建 COS 实例（延迟初始化，支持内网 Endpoint）
let cosInstance: COS | null = null

function getCosInstance(): COS | null {
  if (!COS_CONFIG.SecretId || !COS_CONFIG.SecretKey ||
      COS_CONFIG.SecretId === 'your_secret_id_here' ||
      COS_CONFIG.SecretKey === 'your_secret_key_here') {
    console.warn('⚠️ [COS] 未配置腾讯云 COS 密钥，跳过上传')
    return null
  }

  if (!cosInstance) {
    const cosOptions: COS.Options = {
      SecretId: COS_CONFIG.SecretId,
      SecretKey: COS_CONFIG.SecretKey,
    }

    // 🔥 强制使用内网 Endpoint（避免公网路由）
    // cos-nodejs-sdk-v5 通过 domain 参数指定请求域名
    if (COS_CONFIG.InternalEndpoint) {
      cosOptions.Domain = COS_CONFIG.InternalEndpoint
    }

    cosInstance = new COS(cosOptions)
  }

  return cosInstance
}

// ============================================
// 类型定义
// ============================================

export type ModelType = 'suno' | 'banana' | 'sora' | 'other' | 'dify'

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
 * 直接上传 Buffer 到腾讯云 COS
 * 
 * @param buffer - 文件 Buffer
 * @param modelName - 模型名称（用于目录组织）
 * @param fileExtension - 文件扩展名（如 mp3, png, mp4）
 * @param fileName - 原始文件名（可选）
 * @returns 上传结果，包含 CDN 加速 URL
 */
export async function uploadBufferToCos(
  buffer: Buffer,
  modelName: ModelType,
  fileExtension: string,
  fileName?: string
): Promise<UploadResult> {
  console.log('📤 [COS] 开始上传 Buffer:', { size: buffer.length, modelName, fileName })
  
  // 检查 COS 实例
  const cos = getCosInstance()
  if (!cos) {
    console.log('⚠️ [COS] 未配置密钥，跳过上传')
    return {
      success: false,
      cdnUrl: '',
      error: 'COS 未配置',
    }
  }
  
  try {
    // 生成存储路径
    const date = new Date().toISOString().split('T')[0] // 2026-01-05
    const uuid = randomUUID()
    const key = `ai-generated/${modelName}/${date}/${uuid}.${fileExtension}`
    
    console.log('📁 [COS] 存储路径:', key)
    
    // 上传到 COS
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
    
    // 构建 CDN URL
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
    
    return {
      success: false,
      cdnUrl: '',
      error: error.message || '上传失败',
    }
  }
}

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

// ============================================
// CDN URL 重写（用于 Dify 存储路由）
// ============================================

/**
 * 将 COS 内网/直连 URL 重写为 CDN 分发 URL
 *
 * 支持的源 URL 格式：
 * - https://media-shenxiang-1394034082.cos-internal.ap-hongkong.tencentcos.cn/xxx
 * - https://cos.ap-hongkong.myqcloud.com/xxx
 * - https://media-shenxiang-1394034082.cos.ap-hongkong.tencentcos.cn/xxx
 *
 * @param url 原始 URL（Dify 返回的 presigned URL 或 COS 直连 URL）
 * @returns CDN 加速 URL
 */
export function rewriteToCdnUrl(url: string): string {
  if (!url) return url
  if (isCdnUrl(url)) return url

  // 支持多种 COS endpoint 格式
  const COS_ENDPOINT_PATTERNS = [
    COS_CONFIG.InternalEndpoint,
    COS_CONFIG.DifyStorageEndpoint,
    `https://${COS_CONFIG.Bucket}.cos-internal.${COS_CONFIG.Region}.tencentcos.cn`,
    `https://cos.${COS_CONFIG.Region}.myqcloud.com`,
    `https://${COS_CONFIG.Bucket}.cos.${COS_CONFIG.Region}.tencentcos.cn`,
  ].filter(Boolean)

  for (const pattern of COS_ENDPOINT_PATTERNS) {
    if (pattern && url.includes(pattern)) {
      return url.replace(pattern, COS_CONFIG.CdnDomain)
    }
  }

  return url
}

/**
 * 将 CDN URL 反向还原为 COS 内网 URL（用于服务端访问）
 */
export function rewriteCdnToCosUrl(url: string): string {
  if (!url) return url
  if (!isCdnUrl(url)) return url

  if (COS_CONFIG.InternalEndpoint) {
    return url.replace(COS_CONFIG.CdnDomain, COS_CONFIG.InternalEndpoint)
  }
  if (COS_CONFIG.DifyStorageEndpoint) {
    return url.replace(COS_CONFIG.CdnDomain, COS_CONFIG.DifyStorageEndpoint)
  }

  return url
}

/**
 * 从 Dify 响应中提取并重写所有文件 URL 为 CDN URL
 * 用于拦截 Dify API 响应，批量替换其中的文件访问链接
 *
 * @param difyResponse Dify API 响应对象
 * @returns 替换 URL 后的响应对象（浅拷贝）
 */
export function rewriteDifyResponseUrls<T extends Record<string, unknown>>(difyResponse: T): T {
  const rewritten = { ...difyResponse }

  // 递归遍历对象，替换所有字符串值中的 URL
  function replaceUrls(obj: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && (value.includes('cos-') || value.includes('tencentcos'))) {
        obj[key] = rewriteToCdnUrl(value)
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'object' && item !== null) {
            replaceUrls(item as Record<string, unknown>)
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        replaceUrls(value as Record<string, unknown>)
      }
    }
  }

  replaceUrls(rewritten)
  return rewritten
}
