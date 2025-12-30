'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { GraduationCap, Copy, Download, ArrowLeft, Eye, Calendar, Loader2, User, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const BRAND_GREEN = "#14532d"

// Markdown 渲染组件
const InlineText = ({ text }: { text: string }) => {
  if (!text) return null
  const parts = text.split(/(\*\*.*?\*\*)/g)
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={index} className="font-semibold text-emerald-800">{part.slice(2, -2)}</strong>
        }
        return <span key={index}>{part}</span>
      })}
    </>
  )
}

const TableBlock = ({ lines }: { lines: string[] }) => {
  if (lines.length < 2) return null
  try {
    const headerLine = lines.find(l => l.includes("|") && !l.includes("---"))
    const bodyLines = lines.filter(l => l.includes("|") && !l.includes("---") && l !== headerLine)
    if (!headerLine) return null
    const headers = headerLine.split("|").filter(c => c.trim()).map(c => c.trim())
    return (
      <div className="my-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bodyLines.map((line, i) => {
                const cells = line.split("|").filter(c => c.trim()).map(c => c.trim())
                return (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    {cells.map((cell, j) => (
                      <td key={j} className="px-4 py-3 text-sm text-slate-600">
                        <InlineText text={cell} />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  } catch (e) {
    return null
  }
}

function ContentRenderer({ content }: { content: string }) {
  if (!content) return null
  const lines = content.split("\n")
  const renderedElements = []
  let tableBuffer: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isTableLine = line.trim().startsWith("|") && line.includes("|")
    const isLastLine = i === lines.length - 1

    if (isTableLine) {
      tableBuffer.push(line)
      if (isLastLine || !lines[i + 1].trim().startsWith("|")) {
        renderedElements.push(<TableBlock key={`tbl-${i}`} lines={tableBuffer} />)
        tableBuffer = []
      }
      continue
    }

    if (line.trim().match(/^#{4,}\s/)) continue

    if (line.trim().startsWith("# ")) {
      renderedElements.push(
        <h1 key={i} className="mt-8 mb-4 text-2xl font-bold text-slate-800">
          {line.replace(/^#\s+/, "")}
        </h1>
      )
    } else if (line.trim().startsWith("## ")) {
      renderedElements.push(
        <h2 key={i} className="mt-6 mb-3 text-xl font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-1 h-5 bg-emerald-600 rounded-full"></span>
          {line.replace(/^##\s+/, "")}
        </h2>
      )
    } else if (line.trim().startsWith("### ")) {
      renderedElements.push(
        <h3 key={i} className="mt-5 mb-2 text-lg font-semibold text-emerald-800">
          {line.replace(/^###\s+/, "")}
        </h3>
      )
    } else if (line.trim().startsWith("- ")) {
      renderedElements.push(
        <div key={i} className="flex gap-2.5 ml-1 my-2 text-base text-slate-600 leading-relaxed">
          <div className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></div>
          <span><InlineText text={line.replace(/^- /, "")} /></span>
        </div>
      )
    } else if (line.trim().startsWith("> ")) {
      renderedElements.push(
        <blockquote key={i} className="my-4 border-l-3 border-emerald-500 bg-emerald-50 px-4 py-3 rounded-r-xl">
          <div className="text-base text-slate-600 leading-relaxed">
            <InlineText text={line.replace(/^> /, "")} />
          </div>
        </blockquote>
      )
    } else if (line.trim() === "---") {
      renderedElements.push(<div key={i} className="py-4"><div className="h-px bg-slate-200"></div></div>)
    } else if (line.trim() === "") {
      renderedElements.push(<div key={i} className="h-3"></div>)
    } else {
      renderedElements.push(
        <p key={i} className="text-base leading-[1.8] text-slate-600 my-2">
          <InlineText text={line} />
        </p>
      )
    }
  }
  return <div className="w-full">{renderedElements}</div>
}

// 🔥 对话消息组件
function MessageItem({ role, content }: { role: 'user' | 'assistant', content: string }) {
  return (
    <div className={cn("flex gap-3", role === "user" ? "justify-end" : "justify-start")}>
      {role === "assistant" && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white mt-1" style={{ backgroundColor: BRAND_GREEN }}>
          <Sparkles className="h-4 w-4" />
        </div>
      )}
      <div className={cn(
        "relative rounded-2xl px-4 py-3",
        role === "user" 
          ? "text-white max-w-[75%]" 
          : "bg-slate-50 w-full max-w-full"
      )} style={role === "user" ? { backgroundColor: BRAND_GREEN } : {}}>
        {role === "user" ? (
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{content}</div>
        ) : (
          <ContentRenderer content={content} />
        )}
      </div>
      {role === "user" && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-200 mt-1">
          <User className="h-4 w-4 text-slate-500" />
        </div>
      )}
    </div>
  )
}

export default function SharePage() {
  const params = useParams()
  const router = useRouter()
  const shareId = params.id as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shareData, setShareData] = useState<{
    content: string
    title: string
    view_count: number
    created_at: string
  } | null>(null)
  
  // 🔥 解析后的对话数据
  const [parsedData, setParsedData] = useState<{
    type: 'conversation' | 'single'
    modelName?: string
    messages?: Array<{ role: 'user' | 'assistant', content: string }>
    content?: string
  } | null>(null)

  useEffect(() => {
    const fetchShare = async () => {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )

        // 获取分享内容
        const { data, error: fetchError } = await supabase
          .from('shared_content')
          .select('content, title, view_count, created_at')
          .eq('share_id', shareId)
          .single()

        if (fetchError || !data) {
          setError('分享内容不存在或已过期')
          return
        }

        setShareData(data)
        
        // 🔥 解析内容
        try {
          const parsed = JSON.parse(data.content)
          setParsedData(parsed)
        } catch {
          // 兼容旧格式：纯文本内容
          setParsedData({
            type: 'single',
            content: data.content
          })
        }

        // 更新查看次数
        await supabase
          .from('shared_content')
          .update({ view_count: (data.view_count || 0) + 1 })
          .eq('share_id', shareId)

      } catch (err) {
        console.error('获取分享失败:', err)
        setError('加载失败，请稍后重试')
      } finally {
        setLoading(false)
      }
    }

    if (shareId) {
      fetchShare()
    }
  }, [shareId])

  const handleCopy = async () => {
    if (!parsedData) return
    
    let textToCopy = ''
    if (parsedData.type === 'conversation' && parsedData.messages) {
      textToCopy = parsedData.messages.map(m => 
        `${m.role === 'user' ? '用户' : 'AI'}：${m.content}`
      ).join('\n\n')
    } else if (parsedData.content) {
      textToCopy = parsedData.content
    }
    
    await navigator.clipboard.writeText(textToCopy)
    toast.success('已复制到剪贴板')
  }

  const handleExportPDF = () => {
    if (!parsedData) return

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('请允许弹出窗口')
      return
    }

    // 🔥 根据类型生成不同的 HTML
    let htmlContent = ''
    
    if (parsedData.type === 'conversation' && parsedData.messages) {
      htmlContent = parsedData.messages.map(m => {
        if (m.role === 'user') {
          return `<div class="user-message"><strong>用户：</strong>${m.content}</div>`
        } else {
          return `<div class="ai-message"><strong>AI：</strong>${convertMarkdownToHTML(m.content)}</div>`
        }
      }).join('')
    } else if (parsedData.content) {
      htmlContent = convertMarkdownToHTML(parsedData.content)
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${shareData?.title || '沈翔智学 - AI 对话'}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #333; line-height: 1.8; }
          .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #14532d; }
          .header h1 { color: #14532d; font-size: 24px; margin-bottom: 8px; }
          .header p { color: #666; font-size: 12px; }
          .content { font-size: 14px; }
          .user-message { background: #14532d; color: white; padding: 12px 16px; border-radius: 12px; margin: 16px 0; max-width: 80%; margin-left: auto; }
          .ai-message { background: #f5f5f5; padding: 16px; border-radius: 12px; margin: 16px 0; }
          .content h1 { font-size: 20px; color: #14532d; margin: 24px 0 12px; }
          .content h2 { font-size: 18px; color: #14532d; margin: 20px 0 10px; border-left: 3px solid #14532d; padding-left: 10px; }
          .content h3 { font-size: 16px; color: #14532d; margin: 16px 0 8px; }
          .content p { margin: 8px 0; }
          .content strong { color: #14532d; font-weight: 600; }
          .content ul { margin: 12px 0; padding-left: 24px; }
          .content li { margin: 6px 0; }
          .content blockquote { margin: 12px 0; padding: 12px 16px; background: #f5f5f5; border-left: 3px solid #14532d; }
          .content hr { margin: 20px 0; border: none; border-top: 1px solid #eee; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${parsedData.modelName || '沈翔智学'} - AI 对话</h1>
          <p>${new Date().toLocaleString('zh-CN')}</p>
        </div>
        <div class="content">${htmlContent}</div>
        <div class="footer">由沈翔智学 AI 生成 · www.shenxiang.school</div>
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.onload = () => printWindow.print()
    toast.success('已打开打印预览')
  }

  // Markdown 转 HTML
  function convertMarkdownToHTML(md: string): string {
    let html = md
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
    html = html.replace(/^---$/gm, '<hr>')
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    html = html.replace(/(<li>.+<\/li>\n?)+/g, '<ul>$&</ul>')
    const lines = html.split('\n')
    html = lines.map(line => {
      const trimmed = line.trim()
      if (!trimmed) return ''
      if (trimmed.startsWith('<')) return line
      return `<p>${line}</p>`
    }).join('\n')
    return html
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-slate-500">加载中...</p>
        </div>
      </div>
    )
  }

  if (error || !shareData || !parsedData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="mb-4 flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-red-100">
            <GraduationCap className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl font-semibold text-slate-800 mb-2">内容不存在</h1>
          <p className="text-slate-500 mb-6">{error || '该分享链接无效或已过期'}</p>
          <Button onClick={() => router.push('/')} className="bg-emerald-600 hover:bg-emerald-700">
            返回首页
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="text-sm font-medium">返回首页</span>
          </button>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-emerald-600" />
            <span className="font-semibold text-slate-800">沈翔智学</span>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* 标题卡片 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-2">
            {parsedData.modelName && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full text-white" style={{ backgroundColor: BRAND_GREEN }}>
                {parsedData.modelName}
              </span>
            )}
            {parsedData.type === 'conversation' && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                对话记录
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-4">{shareData.title || 'AI 对话'}</h1>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              <span>{new Date(shareData.created_at).toLocaleDateString('zh-CN')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Eye className="h-4 w-4" />
              <span>{shareData.view_count + 1} 次查看</span>
            </div>
          </div>
        </div>

        {/* 内容卡片 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
          {/* 🔥 根据类型渲染不同内容 */}
          {parsedData.type === 'conversation' && parsedData.messages ? (
            <div className="space-y-6">
              {parsedData.messages.map((msg, index) => (
                <MessageItem key={index} role={msg.role} content={msg.content} />
              ))}
            </div>
          ) : (
            <ContentRenderer content={parsedData.content || ''} />
          )}

          {/* 操作按钮 */}
          <div className="mt-8 pt-6 border-t border-slate-200 flex items-center justify-end gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-2"
            >
              <Copy className="h-4 w-4" />
              复制内容
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              导出 PDF
            </Button>
          </div>
        </div>

        {/* 底部品牌 */}
        <div className="mt-8 text-center">
          <p className="text-sm text-slate-400">
            由 <a href="https://www.shenxiang.school" className="text-emerald-600 hover:underline">沈翔智学</a> AI 生成
          </p>
        </div>
      </main>
    </div>
  )
}
