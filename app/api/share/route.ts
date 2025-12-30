import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// 生成短链接 ID（8位随机字符）
function generateShareId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// 从内容中提取标题
function extractTitle(content: string): string {
  // 尝试从 Markdown 标题中提取
  const h1Match = content.match(/^#\s+(.+)$/m)
  if (h1Match) return h1Match[1].slice(0, 50)
  
  const h2Match = content.match(/^##\s+(.+)$/m)
  if (h2Match) return h2Match[1].slice(0, 50)
  
  // 否则取前30个字符
  return content.slice(0, 30).replace(/\n/g, ' ') + '...'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { content, userId } = body

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: '内容不能为空' }, { status: 400 })
    }

    // 使用 Service Role Key 创建管理员客户端
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

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

    // 提取标题
    const title = extractTitle(content)

    // 插入分享记录
    const { data, error } = await supabaseAdmin
      .from('shared_content')
      .insert({
        share_id: shareId,
        content: content,
        title: title,
        user_id: userId || null,
        view_count: 0
      })
      .select()
      .single()

    if (error) {
      console.error('创建分享失败:', error)
      return NextResponse.json({ error: '创建分享失败' }, { status: 500 })
    }

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
