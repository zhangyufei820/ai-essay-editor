import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// 🔥 允许的 HTTP 方法
export const dynamic = 'force-dynamic'

// 生成短链接 ID（8位随机字符）
function generateShareId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// 从对话中提取标题
function extractTitle(messages: Array<{role: string, content: string}>): string {
  // 从用户第一条消息提取
  const firstUserMsg = messages.find(m => m.role === 'user')
  if (firstUserMsg) {
    return firstUserMsg.content.slice(0, 30).replace(/\n/g, ' ') + (firstUserMsg.content.length > 30 ? '...' : '')
  }
  
  // 从 AI 回复中提取标题
  const firstAiMsg = messages.find(m => m.role === 'assistant')
  if (firstAiMsg) {
    const h1Match = firstAiMsg.content.match(/^#\s+(.+)$/m)
    if (h1Match) return h1Match[1].slice(0, 50)
    
    const h2Match = firstAiMsg.content.match(/^##\s+(.+)$/m)
    if (h2Match) return h2Match[1].slice(0, 50)
  }
  
  return 'AI 对话分享'
}

export async function POST(request: NextRequest) {
  console.log('🔗 [Share API] 收到分享请求')
  
  try {
    const body = await request.json()
    const { messages, userId, modelName } = body
    
    console.log('🔗 [Share API] 请求参数:', {
      hasMessages: !!messages,
      messagesCount: messages?.length,
      userId: userId?.slice(0, 8) + '...',
      modelName
    })

    // 🔥 支持两种格式：messages 数组（对话）或 content 字符串（单条内容）
    let contentToSave: string
    let title: string

    if (messages && Array.isArray(messages) && messages.length > 0) {
      // 新格式：保存整个对话
      contentToSave = JSON.stringify({
        type: 'conversation',
        modelName: modelName || '沈翔智学',
        messages: messages
      })
      title = extractTitle(messages)
    } else if (body.content && typeof body.content === 'string') {
      // 兼容旧格式：单条内容
      contentToSave = JSON.stringify({
        type: 'single',
        content: body.content
      })
      title = body.content.slice(0, 30).replace(/\n/g, ' ') + '...'
    } else {
      console.error('🔗 [Share API] 内容为空')
      return NextResponse.json({ error: '内容不能为空' }, { status: 400 })
    }

    // 🔥 检查环境变量
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    console.log('🔗 [Share API] 环境变量检查:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
      serviceRoleKeyLength: serviceRoleKey?.length
    })
    
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('🔗 [Share API] 缺少环境变量')
      return NextResponse.json({ error: '服务配置错误' }, { status: 500 })
    }

    // 使用 Service Role Key 创建管理员客户端
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // 生成唯一的分享 ID
    let shareId = generateShareId()
    let attempts = 0
    const maxAttempts = 5

    // 确保 ID 唯一
    while (attempts < maxAttempts) {
      const { data: existing } = await supabaseAdmin
        .from('shared_content')
        .select('share_id')
        .eq('share_id', shareId)
        .single()

      if (!existing) break
      shareId = generateShareId()
      attempts++
    }

    // 插入分享记录
    console.log('🔗 [Share API] 准备插入数据:', { shareId, title, contentLength: contentToSave.length })
    
    const { data, error } = await supabaseAdmin
      .from('shared_content')
      .insert({
        share_id: shareId,
        content: contentToSave,
        title: title,
        user_id: userId || null,
        view_count: 0
      })
      .select()
      .single()

    if (error) {
      console.error('🔗 [Share API] 创建分享失败:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      })
      
      // 🔥 特殊处理：表不存在的错误
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return NextResponse.json({ 
          error: '分享功能暂未开放，请联系管理员',
          detail: '数据库表未创建'
        }, { status: 503 })
      }
      
      return NextResponse.json({ error: '创建分享失败: ' + error.message }, { status: 500 })
    }
    
    console.log('🔗 [Share API] 分享创建成功:', { shareId, title })

    // 构建分享链接
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.shenxiang.school'
    const shareUrl = `${baseUrl}/share/${shareId}`

    return NextResponse.json({
      success: true,
      shareId,
      shareUrl,
      title
    })

  } catch (error) {
    console.error('[Share API Error]', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
