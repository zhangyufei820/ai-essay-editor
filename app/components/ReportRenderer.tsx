"use client"

import React from 'react'

// --- 1. 定义 props ---
interface ReportRendererProps {
  // 接收来自 page.tsx 的流式文本
  reportText: string; 
}

// --- 2. 智能解析函数 ---
/**
 * 这是这个组件的“大脑”。
 * 它接收原始文本，并将其转换为带样式的 React 元素。
 */
const parseReportContent = (text: string): React.ReactNode[] => {
  // 我们用正则表达式来分割【标签】和【内容】
  // (【[^】]+】) 会匹配像 【优点】 这样的标签，并保留它们
  const parts = text.split(/(\【[^】]+\】)/g)

  const nodes: React.ReactNode[] = []
  let currentKey = 0

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue // 跳过空字符串

    // --- A. 如果是【标签】，比如【优点】或【点评】---
    if (part.startsWith('【') && part.endsWith('】')) {
      const tagContent = part.replace(/【|】/g, '') // 移除括号
      
      // 根据标签内容应用不同样式
      if (tagContent.includes('修')) {
        // 这是【修改】标签 -> 使用手写体
        nodes.push(
          <p key={currentKey++} className="font-hand text-red-600 text-2xl mt-4 mb-1">
            {tagContent}
          </p>
        )
      } else if (tagContent.includes('点评')) {
        // 这是【点评】标签 -> 使用衬线体 + 橙色
        nodes.push(
          <h3 key={currentKey++} className="font-serif text-amber-700 font-bold text-xl mt-6 mb-2 pt-2 border-t border-dashed border-gray-300">
            {tagContent}
          </h3>
        )
      } else {
        // 这是【优点】、【建议】等 -> 使用衬线体 + 蓝色
        nodes.push(
          <h3 key={currentKey++} className="font-serif text-blue-800 font-bold text-xl mt-6 mb-2">
            {tagContent}
          </h3>
        )
      }
    } 
    // --- B. 如果是【内容】，比如 "* xxxx" ---
    else {
      // 将内容按行分割
      const lines = part.trim().split('\n')
      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine) continue

        if (trimmedLine.startsWith('* ')) {
          // 这是列表项 -> 使用 list-item
          nodes.push(
            <li key={currentKey++} className="ml-8 list-disc text-base leading-relaxed">
              {trimmedLine.substring(2)}
            </li>
          )
        } else {
          // 这是普通段落
          nodes.push(
            <p key={currentKey++} className="my-2 text-base leading-relaxed">
              {trimmedLine}
            </p>
          )
        }
      }
    }
  }

  return nodes
}


// --- 3. 渲染器组件本体 ---
const ReportRenderer: React.FC<ReportRendererProps> = ({ reportText }) => {
  // 实时调用“大脑”函数
  const contentNodes = parseReportContent(reportText)

  return (
    // 这是你在 CSS 里定义的 3D 透视容器
    <div className="perspective-1000">
      
      {/* 这是核心的“作文纸” */}
      <div
        className="
          report-renderer-wrapper 
          texture-paper                   
          max-w-4xl mx-auto p-12 md:p-16 
          border border-black/10 shadow-2xl 
          rounded-lg transition-transform duration-500 
          transform hover:rotate-y-1 
          relative overflow-hidden
          text-ink-color" // ✅ 使用 'ink-color'
        
        // 确保基础字体是衬线体
        style={{ fontFamily: 'var(--font-serif)' }} 
      >
        {/* 这是“印章” */}
        <div
          className="
            absolute top-8 right-8 w-24 h-24 
            border-4 border-red-700 rounded-full 
            flex items-center justify-center 
            text-red-700 text-5xl font-serif font-bold 
            opacity-0 animate-stamp" // ✅ 使用你的印章动画
          style={{ animationDelay: '0.5s' }} // 延迟 0.5 秒盖章
        >
          优
        </div>

        {/* 报告标题 */}
        <h1 className="text-center font-serif text-3xl font-bold mb-10">
          作文智能分析报告
        </h1>
        
        {/* 内容渲染区 */}
        <div className="content-area">
          {contentNodes}
        </div>
        
        {/* 签名和日期 */}
        <div className="mt-16 pt-8 border-t border-dashed border-gray-300 text-right">
          <p className="font-hand text-2xl">沈辩智学</p>
          <p className="font-serif text-sm mt-1">{new Date().toLocaleDateString('zh-CN')}</p>
        </div>
        
      </div>
    </div>
  )
}

export default ReportRenderer