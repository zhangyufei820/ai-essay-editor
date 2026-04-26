"use client"

/**
 * 增强的 Markdown 渲染组件
 *
 * 特性：
 * - 使用 react-markdown 解析标准 Markdown
 * - react-syntax-highlighter 实现代码高亮
 * - 静奢风极简美学（行距 1.6-1.75，文字 #333）
 * - 行内代码样式（灰色背景、等宽字体）
 * - 代码块复制按钮
 */

import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { proxifyGeneratedImagePreviewUrl } from '@/components/chat/image-generation/gpt-image-v11'

// 静奢风配色
const TEXT_COLOR = "#333333"
const SECONDARY_COLOR = "#666666"
const CODE_BG = "#f5f5f5"
const CODE_TEXT = "#e6e6e6"
const INLINE_CODE_BG = "#f0f0f0"
const BORDER_COLOR = "#e5e5e5"

interface EnhancedMarkdownProps {
  content: string
  className?: string
}

// 复制按钮组件
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "absolute top-2 right-2 p-2 rounded-lg transition-all duration-200",
        "hover:bg-white/20 backdrop-blur-sm",
        copied ? "bg-green-500/20 text-green-400" : "bg-white/10 text-gray-400 hover:text-white"
      )}
      title={copied ? "已复制!" : "复制代码"}
    >
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.div
            key="checked"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Check className="w-4 h-4" />
          </motion.div>
        ) : (
          <motion.div
            key="copy"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Copy className="w-4 h-4" />
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  )
}

export function EnhancedMarkdown({ content, className }: EnhancedMarkdownProps) {
  return (
    <div
      className={cn("markdown-body", className)}
      style={{
        color: TEXT_COLOR,
        lineHeight: 1.6,
        fontSize: '13px',
      }}
    >
      <ReactMarkdown
        components={{
          // 标题样式
          h1: ({ children }) => (
            <h1 className="text-base sm:text-xl font-bold mb-2.5 sm:mb-4 mt-4 sm:mt-6" style={{ color: TEXT_COLOR, lineHeight: 1.35 }}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm sm:text-lg font-semibold mb-2 sm:mb-3 mt-3.5 sm:mt-5" style={{ color: TEXT_COLOR, lineHeight: 1.4 }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[13px] sm:text-base font-semibold mb-1.5 mt-3 sm:mt-4" style={{ color: TEXT_COLOR, lineHeight: 1.4 }}>
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-[12px] sm:text-sm font-semibold mb-1.5 mt-2.5 sm:mt-3" style={{ color: TEXT_COLOR, lineHeight: 1.4 }}>
              {children}
            </h4>
          ),

          // 段落和文本
          p: ({ children }) => (
            <p className="mb-2 sm:mb-2.5 leading-relaxed" style={{ lineHeight: 1.6 }}>
              {children}
            </p>
          ),

          // 链接
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 underline underline-offset-2"
            >
              {children}
            </a>
          ),

          // 强调
          strong: ({ children }) => (
            <strong className="font-semibold" style={{ color: TEXT_COLOR }}>
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic" style={{ color: SECONDARY_COLOR }}>
              {children}
            </em>
          ),

          // 列表
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-2 sm:mb-2.5 space-y-0.5 sm:space-y-1">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-2 sm:mb-2.5 space-y-0.5 sm:space-y-1">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed" style={{ lineHeight: 1.65 }}>
              {children}
            </li>
          ),

          // 引用
          blockquote: ({ children }) => (
            <blockquote
              className="border-l-4 pl-3 sm:pl-4 my-2 sm:my-3 italic"
              style={{
                borderColor: BORDER_COLOR,
                color: SECONDARY_COLOR,
              }}
            >
              {children}
            </blockquote>
          ),

          // 行内代码
          code: ({ className, children, ...props }) => {
            const isInline = !className
            if (isInline) {
                return (
                  <code
                  className="px-1.5 py-0.5 rounded text-[12px] sm:text-sm font-mono"
                  style={{
                    backgroundColor: INLINE_CODE_BG,
                    color: "#d63384",
                    fontSize: '0.875em',
                  }}
                  {...props}
                >
                  {children}
                </code>
              )
            }
            // 代码块
            const match = /language-(\w+)/.exec(className || '')
            const language = match ? match[1] : ''
            const codeString = String(children).replace(/\n$/, '')

            return (
              <div className="relative my-2.5 sm:my-4 rounded-xl overflow-hidden shadow-lg">
                {/* 语言标签 */}
                {language && (
                  <div className="absolute top-0 left-3 px-2 py-1 text-[10px] sm:text-xs rounded-b-lg bg-white/10 text-gray-400">
                    {language}
                  </div>
                )}
                <CopyButton text={codeString} />
                  <SyntaxHighlighter
                  style={oneDark}
                  language={language || 'text'}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    padding: '0.875rem',
                    backgroundColor: '#1e1e1e',
                    fontSize: '0.78rem',
                    lineHeight: 1.6,
                    borderRadius: '0.75rem',
                  }}
                  showLineNumbers={false}
                  wrapLines={true}
                >
                  {codeString}
                </SyntaxHighlighter>
              </div>
            )
          },

          // 预格式化代码块
          pre: ({ children }) => (
            <pre className="my-2 sm:my-3">
              {children}
            </pre>
          ),

          // 水平线
          hr: () => (
            <hr className="my-6 border-gray-200" />
          ),

          // 图片
          img: ({ src, alt }) => (
            <img
              src={src ? proxifyGeneratedImagePreviewUrl(String(src), 900) : src}
              alt={alt || '图片'}
              className="rounded-xl max-w-full h-auto my-3 sm:my-4 shadow-md"
              loading="lazy"
            />
          ),

          // 表格
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 sm:my-4">
              <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-50">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-gray-200">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-gray-50 transition-colors">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2 text-sm" style={{ color: SECONDARY_COLOR }}>
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
