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
import { spendCredits, getUserCredits } from '@/lib/credits'

// 🔥 Suno 音乐生成计费配置
const SUNO_BASE_CREDITS = 100           // 基础费用（Suno API 调用）
const TOKEN_TO_CREDITS_RATIO = 0.01     // Token 转积分比例：100 tokens = 1 积分

export const dynamic = 'force-dynamic'

// Suno API 配置（从环境变量读取，或使用默认值）
const SUNO_BASE_URL = process.env.SUNO_API_BASE_URL || "http://43.154.111.156/v1"
const SUNO_GENERATE_API_KEY = process.env.SUNO_GENERATE_API_KEY || "app-aUM5wY1ACN5M0zHkMdijZCcC"
const SUNO_QUERY_API_KEY = process.env.SUNO_QUERY_API_KEY || "app-XenDdavZwSjiEHd2SyiTfECc"

/** 专业模式表单数据结构 - 🔥 与 Dify 工作流参数完全对应 */
interface SunoProFormInputs {
  task_mode: 'Normal' | 'Extend' | 'Cover'
  MV: 'chirp-v5' | 'chirp-v4' | 'chirp-v3-5' | 'chirp-v3-0'
  target_id: string
  continue_at: number | null
  title: string
  prompt: string      // 🔥 风格提示词（填了跳过 LLM）
  lyrics: string      // 🔥 歌词（只填这个走 LLM）
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
        MV: 'chirp-v5',  // 🔥 统一使用 V5 模型
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
  
  // 🔥 检查并扣除积分
  console.log('🎵 [Suno Proxy Pro] 检查用户积分, userId:', userId)
  const userCredits = await getUserCredits(userId)
  
  if (!userCredits) {
    console.error('❌ [Suno Proxy Pro] 无法获取用户积分')
    return NextResponse.json({ 
      error: '无法获取用户积分信息',
      code: 'CREDITS_NOT_FOUND'
    }, { status: 400 })
  }
  
  console.log('🎵 [Suno Proxy Pro] 当前积分:', userCredits.credits, '需要消耗:', SUNO_BASE_CREDITS)
  
  if (userCredits.credits < SUNO_BASE_CREDITS) {
    console.error('❌ [Suno Proxy Pro] 积分不足')
    return NextResponse.json({ 
      error: `积分不足，需要 ${SUNO_BASE_CREDITS} 积分，当前余额 ${userCredits.credits}`,
      code: 'INSUFFICIENT_CREDITS',
      required: SUNO_BASE_CREDITS,
      current: userCredits.credits
    }, { status: 402 })
  }
  
  // 🔥 扣除基础积分（流式结束后会补扣 Token 费用）
  const spendSuccess = await spendCredits(
    userId, 
    SUNO_BASE_CREDITS, 
    'suno_music', 
    `🎵 AI 音乐创作 - ${formData.task_mode} 模式（基础费用）`,
    conversationId
  )
  
  if (!spendSuccess) {
    console.error('❌ [Suno Proxy Pro] 积分扣除失败')
    return NextResponse.json({ 
      error: '积分扣除失败，请重试',
      code: 'CREDITS_DEDUCT_FAILED'
    }, { status: 500 })
  }
  
  console.log('✅ [Suno Proxy Pro] 基础积分扣除成功，剩余:', userCredits.credits - SUNO_BASE_CREDITS)
  
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
  
  // 🔥 关键：确保 MV 有默认值，统一使用最新的 chirp-v5
  const mvValue = formData.MV || 'chirp-v5'
  console.log('🎵 [Suno Proxy Pro] MV 值:', formData.MV, '->', mvValue)
  
  // 🔥 关键：确保 instrumental 值正确（false = 有人声，true = 纯音乐）
  const instrumentalValue = formData.instrumental === true
  console.log('🎵 [Suno Proxy Pro] instrumental 值:', { 
    raw: formData.instrumental, 
    type: typeof formData.instrumental,
    converted: instrumentalValue 
  })
  
  // 🔥 关键逻辑：
  // - lyrics 有值 + prompt 为空 → 走 LLM（Dify 条件分支判断）
  // - lyrics 有值 + prompt 有值 → 跳过 LLM，直接生成
  const lyricsValue = formData.lyrics || ''
  const promptValue = formData.prompt || ''
  
  console.log('🎵 [Suno Proxy Pro] 歌词与提示词:', {
    hasLyrics: !!lyricsValue,
    hasPrompt: !!promptValue,
    willUseLLM: lyricsValue && !promptValue
  })
  
  // 🔥 关键修复：空字符串不传递，让 Dify 正确判断"为空"
  const inputs: Record<string, any> = {
    // 🔥 必填字段
    task_mode: taskModeMapping[formData.task_mode] || '1. inspiration (灵感模式)',
    MV: mvValue,
    vocal_gender: formData.vocal_gender || 'm',
    
    // 🔥 布尔类型
    instrumental: instrumentalValue,
  }
  
  // 🔥 可选字段：只有有值时才传递，空字符串不传
  if (lyricsValue) inputs.lyrics = lyricsValue
  if (promptValue) inputs.prompt = promptValue
  if (formData.style_tags?.trim()) inputs.style_tags = formData.style_tags.trim()
  if (formData.title?.trim()) inputs.title = formData.title.trim()
  if (formData.target_id?.trim()) inputs.target_id = formData.target_id.trim()
  if (formData.negative_tags?.trim()) inputs.negative_tags = formData.negative_tags.trim()
  
  console.log('🎵 [Suno Proxy Pro] 最终 instrumental 在 inputs 中:', inputs.instrumental)
  console.log('🎵 [Suno Proxy Pro] lyrics 和 prompt:', { lyrics: inputs.lyrics?.slice(0, 50), prompt: inputs.prompt?.slice(0, 50) })
  
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

  // 🔥 创建 TransformStream 处理流式响应，解析 Token 使用量
  const { readable, writable } = new TransformStream()
  
  // 🔥 在后台处理流，解析 token 并补扣积分
  processStreamWithTokenBilling(response.body!, writable, userId, formData.task_mode, conversationId)
  
  const headers = new Headers()
  headers.set('Content-Type', 'text/event-stream')
  headers.set('Cache-Control', 'no-cache')
  headers.set('Connection', 'keep-alive')

  return new Response(readable, {
    status: 200,
    headers,
  })
}

/**
 * 🔥 处理流式响应，解析 Token 使用量并补扣积分
 */
async function processStreamWithTokenBilling(
  sourceStream: ReadableStream<Uint8Array>,
  targetWritable: WritableStream<Uint8Array>,
  userId: string,
  taskMode: string,
  conversationId?: string
) {
  const reader = sourceStream.getReader()
  const writer = targetWritable.getWriter()
  const decoder = new TextDecoder()
  
  let buffer = ''
  let totalTokens = 0
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) {
        break
      }
      
      // 写入原始数据到客户端
      await writer.write(value)
      
      // 解析 SSE 事件获取 token 使用量
      buffer += decoder.decode(value, { stream: true })
      
      // 处理完整的 SSE 事件
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // 保留不完整的行
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const jsonStr = line.slice(6).trim()
            if (jsonStr && jsonStr !== '[DONE]') {
              const event = JSON.parse(jsonStr)
              
              // 🔥 检查 message_end 事件，获取 token 使用量
              if (event.event === 'message_end' && event.metadata?.usage) {
                const usage = event.metadata.usage
                totalTokens = usage.total_tokens || 0
                console.log('💰 [Token 计费] 检测到使用量:', {
                  total_tokens: totalTokens,
                  prompt_tokens: usage.prompt_tokens,
                  completion_tokens: usage.completion_tokens
                })
              }
            }
          } catch (e) {
            // JSON 解析失败，忽略
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ [Token 计费] 流处理错误:', error)
  } finally {
    await writer.close()
    
    // 🔥 流结束后，根据 Token 使用量补扣积分
    if (totalTokens > 0) {
      const tokenCredits = Math.ceil(totalTokens * TOKEN_TO_CREDITS_RATIO)
      
      if (tokenCredits > 0) {
        console.log('💰 [Token 计费] 补扣积分:', {
          totalTokens,
          tokenCredits,
          ratio: TOKEN_TO_CREDITS_RATIO
        })
        
        const success = await spendCredits(
          userId,
          tokenCredits,
          'suno_llm_token',
          `🎵 AI 音乐创作 - ${taskMode} 模式（LLM Token: ${totalTokens}）`,
          conversationId
        )
        
        if (success) {
          console.log('✅ [Token 计费] Token 积分补扣成功:', tokenCredits)
        } else {
          console.error('❌ [Token 计费] Token 积分补扣失败')
        }
      }
    } else {
      console.log('💰 [Token 计费] 无 LLM Token 消耗（可能跳过了 LLM）')
    }
  }
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
        MV: 'chirp-v5',  // 🔥 统一使用 V5 模型
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
