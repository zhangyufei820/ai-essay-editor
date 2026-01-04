/**
 * Suno 音乐生成 API 代理
 * 
 * 🎵 解决问题：
 * 1. CORS - 浏览器跨域限制
 * 2. Mixed Content - HTTPS 网站调用 HTTP API
 * 3. API Key 安全 - 不暴露在前端
 * 
 * 🔥 更新：支持流式输出
 */

import { NextRequest, NextResponse } from 'next/server'

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
  console.log('✅ [Suno Proxy] 查询成功:', data.data?.outputs?.status)
  
  return NextResponse.json(data)
}
