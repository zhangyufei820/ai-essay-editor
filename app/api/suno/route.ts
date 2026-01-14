/**
 * Suno 音乐生成 API 代理
 * 
 * 🎵 解决问题：
 * 1. CORS - 浏览器跨域限制
 * 2. Mixed Content - HTTPS 网站调用 HTTP API
 * 3. API Key 安全 - 不暴露在前端
 * 
 * 🔥 更新：支持流式输出
 * 🔥 更新：集成腾讯云 COS 存储，将音频/封面转存至 CDN
 */

import { NextRequest, NextResponse } from 'next/server'
import { uploadToCos, isCdnUrl, isCosConfigured } from '@/lib/cos'

export const dynamic = 'force-dynamic'

// Suno API 配置（从环境变量读取，或使用默认值）
const SUNO_BASE_URL = process.env.SUNO_API_BASE_URL || "http://43.154.111.156/v1"
const SUNO_GENERATE_API_KEY = process.env.SUNO_GENERATE_API_KEY || "app-aUM5wY1ACN5M0zHkMdijZCcC"
const SUNO_QUERY_API_KEY = process.env.SUNO_QUERY_API_KEY || "app-XenDdavZwSjiEHd2SyiTfECc"

/** 专业模式表单数据结构 - 🔥 与 Dify 工作流参数完全对应 */
interface SunoProFormInputs {
  task_mode: 'Normal' | 'Extend' | 'Cover'
  MV: 'chirp-v5' | 'chirp-v4' | 'chirp-v3-5' | 'chirp-v3-0'  // 🔥 添加 chirp-v5
  target_id: string
  continue_at: number | null
  title: string
  prompt: string
  style_tags: string
  negative_tags: string
  instrumental: boolean
  vocal_gender: 'm' | 'f'
  end_at: number | null
}

export async function POST(req: NextRequest) {
  console.log('🎵 [Suno Proxy] 收到请求')
  
  try {
    const body = await req.json()
    const { 
      action, 
      query, 
      userId, 
      taskId, 
      streaming, 
      taskMode, 
      conversationId,
      // 🔥 专业模式新增字段
      proFormData
    } = body
    
    // 🔥 调试日志：打印原始参数
    console.log('🎵 [Suno Proxy] 参数:', { 
      action, 
      userId: userId?.slice(0, 8), 
      hasQuery: !!query, 
      taskId, 
      streaming, 
      taskMode,
      hasProFormData: !!proFormData,
      rawBody: JSON.stringify(body).slice(0, 300)
    })

    if (action === 'generate') {
      // 🔥 专业模式：使用 proFormData 中的完整参数
      if (proFormData) {
        console.log('🎵 [Suno Proxy] 使用专业模式参数:', proFormData)
        if (streaming) {
          return await handleGenerateStreamingPro(proFormData, userId, conversationId)
        }
        return await handleGeneratePro(proFormData, userId, conversationId)
      }
      
      // 🔥 简单模式：兼容旧逻辑
      const taskModeMap: Record<string, string> = {
        'inspiration': '1. inspiration (灵感模式)',
        'custom': '2. custom (自定义模式)',
        'extend': '3. extend (续写模式)',
        'fetch': '4. fetch (查询进度)'
      }
      const safeTaskMode = taskModeMap[taskMode] || taskModeMap['inspiration']
      console.log('🎵 [Suno Proxy] 简单模式 - 转换 taskMode:', taskMode, '->', safeTaskMode)
      
      if (streaming) {
        return await handleGenerateStreaming(query, userId, safeTaskMode, conversationId)
      }
      return await handleGenerate(query, userId, safeTaskMode, conversationId)
    } else if (action === 'query') {
      // 查询状态
      return await handleQuery(taskId, userId)
    } else {
      return NextResponse.json({ error: '无效的 action' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('❌ [Suno Proxy] 错误:', error)
    return NextResponse.json({ error: error.message || '服务器错误' }, { status: 500 })
  }
}

// 生成音乐（阻塞模式）
async function handleGenerate(query: string, userId: string, taskMode?: string, conversationId?: string) {
  console.log('🎵 [Suno Proxy] 开始生成音乐（阻塞模式）, taskMode:', taskMode, 'conversationId:', conversationId)
  
  const url = `${SUNO_BASE_URL}/chat-messages`
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUNO_GENERATE_API_KEY}`,
    },
    body: JSON.stringify({
      inputs: { 
        task_mode: taskMode || '1. inspiration (灵感模式)',  // 🔥 使用完整格式
        MV: 'chirp-v4',  // 🔥 必填字段
        vocal_gender: 'm',  // 🔥 必填字段
      },
      query: query,
      response_mode: 'blocking',
      user: userId,
      conversation_id: conversationId || '',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ [Suno Proxy] 生成 API 错误:', response.status, errorText)
    return NextResponse.json({ 
      error: `Suno API 错误: ${response.status}`,
      details: errorText 
    }, { status: response.status })
  }

  const data = await response.json()
  console.log('✅ [Suno Proxy] 生成成功:', data.answer?.slice(0, 100))
  
  return NextResponse.json(data)
}

// ============================================
// 🔥 专业模式处理函数
// ============================================

/**
 * 专业模式 - 生成音乐（阻塞模式）
 * 使用完整的表单参数提交至 Dify API
 */
async function handleGeneratePro(formData: SunoProFormInputs, userId: string, conversationId?: string) {
  console.log('🎵 [Suno Proxy Pro] 开始生成音乐（阻塞模式）')
  console.log('🎵 [Suno Proxy Pro] 参数:', JSON.stringify(formData, null, 2))
  
  const url = `${SUNO_BASE_URL}/chat-messages`
  
  // 🔥 构建 inputs 对象，确保与 Dify 工作流参数完全对应
  // 🔥 关键修复：可选的数字字段为空时不传，避免 API 校验错误
  
  // 🔥 关键修复：task_mode 必须使用完整选项字符串
  const taskModeMapping: Record<string, string> = {
    'Normal': '1. inspiration (灵感模式)',
    'Extend': '3. extend (续写模式)',
    'Cover': '4.Cover(翻唱)'
  }
  
  // 🔥 处理 negative_tags：Dify 工作流中是数组类型
  const negativeTagsArray = formData.negative_tags 
    ? formData.negative_tags.split(',').map(tag => tag.trim()).filter(Boolean)
    : []
  
  const inputs: Record<string, any> = {
    task_mode: taskModeMapping[formData.task_mode] || '1. inspiration (灵感模式)',
    MV: formData.MV || 'chirp-v5',  // 🔥 默认使用最新版本
    prompt: (formData.prompt || '').trim(),
    style_tags: (formData.style_tags || '').trim(),
    title: (formData.title || '').trim(),
    instrumental: formData.instrumental ?? false,
    target_id: (formData.target_id || '').trim(),
    negative_tags: negativeTagsArray,  // 🔥 转换为数组格式
    vocal_gender: (formData.vocal_gender || 'm').trim(),
  }
  
  // 🔥 关键修复：只有在有值时才传递数字字段
  if (formData.continue_at !== null && formData.continue_at !== undefined) {
    inputs.continue_at = Number(formData.continue_at)
  }
  if (formData.end_at !== null && formData.end_at !== undefined) {
    inputs.end_at = Number(formData.end_at)
  }
  
  console.log('🎵 [Suno Proxy Pro] 清洗后的 inputs:', inputs)
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUNO_GENERATE_API_KEY}`,
    },
    body: JSON.stringify({
      inputs,
      query: formData.prompt || '执行任务', // 🔥 使用 prompt 作为 query
      response_mode: 'blocking',
      user: userId,
      conversation_id: conversationId || '',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ [Suno Proxy Pro] 生成 API 错误:', response.status, errorText)
    return NextResponse.json({ 
      error: `Suno API 错误: ${response.status}`,
      details: errorText 
    }, { status: response.status })
  }

  const data = await response.json()
  console.log('✅ [Suno Proxy Pro] 生成成功:', data.answer?.slice(0, 100))
  
  return NextResponse.json(data)
}

/**
 * 专业模式 - 生成音乐（流式模式）
 * 使用完整的表单参数提交至 Dify API
 */
async function handleGenerateStreamingPro(formData: SunoProFormInputs, userId: string, conversationId?: string) {
  console.log('🎵 [Suno Proxy Pro] 开始生成音乐（流式模式）')
  console.log('🎵 [Suno Proxy Pro] 原始参数:', JSON.stringify(formData, null, 2))
  
  const url = `${SUNO_BASE_URL}/chat-messages`
  
  // 🔥 构建 inputs 对象，严格按照 Dify 工作流定义
  // 🔥 必填字段：task_mode, MV, vocal_gender
  // 🔥 可选字段：prompt, style_tags, title, instrumental, target_id, negative_tags, continue_at, end_at
  
  // 🔥 关键修复：task_mode 必须是 Dify 定义的完整选项字符串
  // Dify 错误明确指出: ['1. inspiration (灵感模式)', '2. custom (自定义模式)', '3. extend (续写模式)', '4.Cover(翻唱)']
  const taskModeMapping: Record<string, string> = {
    'Normal': '1. inspiration (灵感模式)',
    'Extend': '3. extend (续写模式)',
    'Cover': '4.Cover(翻唱)'  // 注意：没有空格！
  }
  
  // 🔥 关键：确保 MV 有默认值，Dify 截图显示默认是 chirp-v4
  const mvValue = formData.MV || 'chirp-v4'
  console.log('🎵 [Suno Proxy Pro] MV 值:', formData.MV, '->', mvValue)
  
  const inputs: Record<string, any> = {
    // 🔥 必填字段 - task_mode 使用完整选项字符串
    task_mode: taskModeMapping[formData.task_mode] || '1. inspiration (灵感模式)',
    MV: mvValue,  // 🔥 确保 MV 总是有值
    vocal_gender: formData.vocal_gender || 'm',
    
    // 🔥 可选字段 - 字符串类型
    prompt: formData.prompt || '',
    style_tags: formData.style_tags || '',
    title: formData.title || '',
    target_id: formData.target_id || '',
    
    // 🔥 布尔类型
    instrumental: !!formData.instrumental,
    
    // 🔥 negative_tags：保持字符串格式（根据截图显示为多行文本）
    negative_tags: formData.negative_tags || '',
  }
  
  // 🔥 数字字段：只有在有值且大于0时才传递
  if (formData.continue_at && Number(formData.continue_at) > 0) {
    inputs.continue_at = Number(formData.continue_at)
  }
  if (formData.end_at && Number(formData.end_at) > 0) {
    inputs.end_at = Number(formData.end_at)
  }
  
  console.log('🎵 [Suno Proxy Pro] 发送到 Dify 的 inputs:', JSON.stringify(inputs, null, 2))
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUNO_GENERATE_API_KEY}`,
    },
    body: JSON.stringify({
      inputs,
      query: formData.prompt || '执行任务', // 🔥 使用 prompt 作为 query
      response_mode: 'streaming',
      user: userId,
      conversation_id: conversationId || '',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ [Suno Proxy Pro] 流式 API 错误:', response.status, errorText)
    return NextResponse.json({ 
      error: `Suno API 错误: ${response.status}`,
      details: errorText 
    }, { status: response.status })
  }

  // 🔥 直接转发流式响应
  const headers = new Headers()
  headers.set('Content-Type', 'text/event-stream')
  headers.set('Cache-Control', 'no-cache')
  headers.set('Connection', 'keep-alive')

  return new Response(response.body, {
    status: 200,
    headers,
  })
}

// 🔥 生成音乐（流式模式）
async function handleGenerateStreaming(query: string, userId: string, taskMode?: string, conversationId?: string) {
  console.log('🎵 [Suno Proxy] 开始生成音乐（流式模式）, taskMode:', taskMode, 'conversationId:', conversationId)
  
  const url = `${SUNO_BASE_URL}/chat-messages`
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUNO_GENERATE_API_KEY}`,
    },
    body: JSON.stringify({
      inputs: { 
        task_mode: taskMode || '1. inspiration (灵感模式)',  // 🔥 使用完整格式
        MV: 'chirp-v4',  // 🔥 必填字段
        vocal_gender: 'm',  // 🔥 必填字段
      },
      query: query,
      response_mode: 'streaming',
      user: userId,
      conversation_id: conversationId || '',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ [Suno Proxy] 流式 API 错误:', response.status, errorText)
    return NextResponse.json({ 
      error: `Suno API 错误: ${response.status}`,
      details: errorText 
    }, { status: response.status })
  }

  // 🔥 直接转发流式响应
  const headers = new Headers()
  headers.set('Content-Type', 'text/event-stream')
  headers.set('Cache-Control', 'no-cache')
  headers.set('Connection', 'keep-alive')

  return new Response(response.body, {
    status: 200,
    headers,
  })
}

// 查询状态
async function handleQuery(taskId: string, userId: string) {
  console.log('🔍 [Suno Proxy] 查询任务状态:', taskId)
  
  const url = `${SUNO_BASE_URL}/workflows/run`
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUNO_QUERY_API_KEY}`,
    },
    body: JSON.stringify({
      inputs: {
        task_id: taskId,
      },
      response_mode: 'blocking',
      user: userId,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ [Suno Proxy] 查询 API 错误:', response.status, errorText)
    return NextResponse.json({ 
      error: `Suno API 错误: ${response.status}`,
      details: errorText 
    }, { status: response.status })
  }

  const data = await response.json()
  const status = data.data?.outputs?.status
  console.log('✅ [Suno Proxy] 查询成功:', status)
  
  // 🔥 如果生成成功，将音频和封面转存到腾讯云 COS
  if (status === 'SUCCESS' || status === 'success') {
    const outputs = data.data?.outputs || {}
    
    // 检查 COS 是否已配置
    if (isCosConfigured()) {
      console.log('📤 [Suno Proxy] 开始转存资源到 COS...')
      
      try {
        // 转存第一首歌的音频
        const audioUrl1 = outputs.audio_url_1 || outputs.audio_url
        if (audioUrl1 && !isCdnUrl(audioUrl1)) {
          const result = await uploadToCos(audioUrl1, 'suno', 'mp3')
          if (result.success) {
            if (outputs.audio_url_1) {
              data.data.outputs.audio_url_1 = result.cdnUrl
            } else {
              data.data.outputs.audio_url = result.cdnUrl
            }
            console.log('✅ [Suno Proxy] 音频1转存成功:', result.cdnUrl)
          }
        }
        
        // 转存第一首歌的封面
        const coverUrl1 = outputs.cover_url_1 || outputs.cover_url
        if (coverUrl1 && !isCdnUrl(coverUrl1)) {
          const result = await uploadToCos(coverUrl1, 'suno', 'jpg')
          if (result.success) {
            if (outputs.cover_url_1) {
              data.data.outputs.cover_url_1 = result.cdnUrl
            } else {
              data.data.outputs.cover_url = result.cdnUrl
            }
            console.log('✅ [Suno Proxy] 封面1转存成功:', result.cdnUrl)
          }
        }
        
        // 转存第二首歌的音频
        if (outputs.audio_url_2 && !isCdnUrl(outputs.audio_url_2)) {
          const result = await uploadToCos(outputs.audio_url_2, 'suno', 'mp3')
          if (result.success) {
            data.data.outputs.audio_url_2 = result.cdnUrl
            console.log('✅ [Suno Proxy] 音频2转存成功:', result.cdnUrl)
          }
        }
        
        // 转存第二首歌的封面
        if (outputs.cover_url_2 && !isCdnUrl(outputs.cover_url_2)) {
          const result = await uploadToCos(outputs.cover_url_2, 'suno', 'jpg')
          if (result.success) {
            data.data.outputs.cover_url_2 = result.cdnUrl
            console.log('✅ [Suno Proxy] 封面2转存成功:', result.cdnUrl)
          }
        }
        
        console.log('✅ [Suno Proxy] 资源转存完成')
      } catch (cosError: any) {
        // 🔥 COS 上传失败不影响业务，记录日志即可
        console.error('⚠️ [Suno Proxy] COS 转存失败，使用原始 URL:', cosError.message)
      }
    } else {
      console.log('⚠️ [Suno Proxy] COS 未配置，跳过资源转存')
    }
  }
  
  return NextResponse.json(data)
}
