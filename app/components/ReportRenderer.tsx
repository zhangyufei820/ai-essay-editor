import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import React from 'react';

interface ReportProps {
  content: string;
}

export default function ReportRenderer({ content }: ReportProps) {
  // 1. 提取分数 (匹配格式 # SCORE: 95)
  const scoreMatch = content.match(/# SCORE:\s*(\d+)/);
  const score = scoreMatch ? scoreMatch[1] : null;
  // 2. 把分数行从正文中去掉，避免重复显示
  const cleanContent = content.replace(/# SCORE:\s*\d+(\n)?/, '');

  return (
    <div className="w-full max-w-4xl mx-auto my-10 perspective-1000">
      {/* 纸张背景容器 */}
      <div className="texture-paper relative text-[var(--ink-color)] p-8 md:p-16 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] rounded-sm border-t border-white/50 min-h-[900px]">
        
        {/* 顶部装订线阴影 */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-b from-black/5 to-transparent"></div>
        
        {/* === 极致的印章分数 (右上角) === */}
        {score && (
          <div className="absolute top-8 right-8 md:top-12 md:right-16 z-10 animate-stamp select-none pointer-events-none">
            <div className="relative flex items-center justify-center w-24 h-24 md:w-32 md:h-32 border-4 border-red-700/80 rounded-full bg-red-50/10 backdrop-blur-[1px] shadow-sm transform rotate-[-12deg]">
              <div className="absolute inset-1 border border-red-700/60 rounded-full"></div>
              <span className="text-6xl md:text-7xl font-bold text-red-700" style={{ fontFamily: 'var(--font-hand)' }}>
                {score}
              </span>
              <span className="absolute bottom-4 text-[10px] md:text-xs font-serif text-red-700/80 tracking-widest uppercase">
                ESSAY SCORE
              </span>
            </div>
          </div>
        )}

        {/* 标题区 */}
        <div className="text-center mb-16 border-b-2 border-stone-800/10 pb-6">
          <h1 className="text-3xl md:text-4xl font-bold tracking-wider mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
            深度作文诊断报告
          </h1>
          <p className="text-stone-400 font-serif italic text-sm">
            AI Intelligent Assessment System
          </p>
        </div>

        {/* 正文渲染区 */}
        <div className="prose prose-lg max-w-none prose-headings:font-serif prose-p:font-serif prose-p:text-stone-700 prose-p:leading-loose">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              // 二级标题 (漂亮的分割线风格)
              h2: ({children}) => (
                <div className="flex items-center gap-3 mt-12 mb-6 group">
                  <div className="h-px flex-grow bg-stone-300 group-hover:bg-teal-600 transition-colors"></div>
                  <h2 className="text-xl font-bold text-stone-800 m-0 px-4 font-sans bg-teal-50/50 rounded-md py-1 border border-teal-100/50">
                    {children}
                  </h2>
                  <div className="h-px flex-grow bg-stone-300 group-hover:bg-teal-600 transition-colors"></div>
                </div>
              ),
              // 三级标题 (带小圆点)
              h3: ({children}) => (
                <h3 className="text-lg font-sans font-bold text-stone-600 mt-8 mb-3 flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-400 mr-2"></span>
                  {children}
                </h3>
              ),
              // 引用块 (自动识别【修改】【点评】变成彩色便利贴)
              blockquote: ({children}) => {
                const text = extractText(children);
                let type = 'normal';
                if (text.includes("【修改】") || text.includes("【佳句】")) type = 'success';
                if (text.includes("【点评】") || text.includes("【建议】")) type = 'warning';

                const styles = {
                  normal: "border-l-4 border-stone-300 bg-stone-50 text-stone-600",
                  success: "border-l-4 border-emerald-500 bg-emerald-50/60 text-emerald-900 shadow-sm",
                  warning: "border-l-4 border-orange-400 bg-orange-50/60 text-orange-900 shadow-sm"
                };

                return (
                  <div className={`my-6 p-4 md:p-5 rounded-r-lg font-sans text-base not-italic ${styles[type as keyof typeof styles]} transition-transform hover:-translate-y-0.5 duration-300`}>
                     <div className="leading-relaxed opacity-90">{children}</div>
                  </div>
                );
              },
              // 角标 (把 [1] 变成黄色小圆标)
              code: ({children}) => {
                 const text = String(children);
                 if (/^\[\d+\]$/.test(text)) {
                   return (
                    <sup className="inline-flex items-center justify-center w-5 h-5 bg-stone-800 text-white text-[10px] font-bold rounded-full ml-1 align-top shadow-md cursor-help hover:scale-110 transition-transform">
                      {text.replace(/[\[\]]/g, '')}
                    </sup>
                   )
                 }
                 return <code className="bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded text-sm font-mono border border-stone-200">{children}</code>
              },
              // 高亮 (荧光笔效果)
              strong: ({children}) => (
                <strong className="font-normal bg-yellow-200/60 px-1 rounded-sm box-decoration-clone text-stone-900">
                  {children}
                </strong>
              )
            }}
          >
            {cleanContent}
          </ReactMarkdown>
        </div>

        {/* 底部签名 */}
        <div className="mt-20 pt-8 border-t border-dashed border-stone-300 flex justify-between items-end font-handwriting text-stone-400">
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-widest opacity-50">Date</span>
            <span className="text-lg">{new Date().toLocaleDateString()}</span>
          </div>
          <div className="flex flex-col gap-1 text-right">
             <span className="text-xs uppercase tracking-widest opacity-50">Reviewer</span>
             <span className="text-2xl text-stone-600 font-bold" style={{fontFamily: 'var(--font-hand)'}}>AI 阅卷组</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 辅助函数：从组件中提取纯文本
function extractText(node: any): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node) && node.props.children) return extractText(node.props.children);
  return '';
}