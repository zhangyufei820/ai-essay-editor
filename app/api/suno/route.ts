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

export async function POST(req: NextRequest) {
  console.log('🎵 [Suno Proxy] 收到请求')
  
  try {
    const body = await req.json()
    const { action, query, userId, taskId, streaming } = body
    
    console.log('🎵 [Suno Proxy] 参数:', { action, userId: userId?.slice(0, 8), hasQuery: !!query, taskId, streaming })

    if (action === 'generate') {
      // 生成音乐
      if (streaming) {
        return await handleGenerateStreaming(query, userId)
      }
      return await handleGenerate(query, userId)
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
async function handleGenerate(query: string, userId: string) {
  console.log('🎵 [Suno Proxy] 开始生成音乐（阻塞模式）')
  
  const url = `${SUNO_BASE_URL}/chat-messages`
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUNO_GENERATE_API_KEY}`,
    },
    body: JSON.stringify({
      inputs: {},
      query: query,
      response_mode: 'blocking',
      user: userId,
      conversation_id: '',  // 🔥 新增：空字符串表示新对话
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

// 🔥 生成音乐（流式模式）
async function handleGenerateStreaming(query: string, userId: string) {
  console.log('🎵 [Suno Proxy] 开始生成音乐（流式模式）')
  
  const url = `${SUNO_BASE_URL}/chat-messages`
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUNO_GENERATE_API_KEY}`,
    },
    body: JSON.stringify({
      inputs: {},
      query: query,
      response_mode: 'streaming',
      user: userId,
      conversation_id: '',  // 🔥 新增：空字符串表示新对话
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
