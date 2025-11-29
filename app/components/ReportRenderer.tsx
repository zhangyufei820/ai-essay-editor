"use client"

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Quote, Sparkles, CheckCircle2, PenTool, Highlighter, Download, Share2, RotateCcw } from 'lucide-react';

interface ReportProps {
  content: string;
}

export default function ReportRenderer({ content }: ReportProps) {
  // 交互状态：管理待办事项的勾选
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  const toggleItem = (index: number) => {
    setCheckedItems(prev => ({ ...prev, [index]: !prev[index] }));
  };

  // === 1. 数据清洗与分离 ===
  const scoreMatch = content.match(/# SCORE:\s*(\d+)/);
  const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
  
  const comments: string[] = [];
  const actionItems: string[] = [];
  
  let processedContent = content.replace(/# SCORE:\s*\d+(\n)?/, '');

  processedContent = processedContent.replace(/> 【修改】(.*?)(?:\n|$)/g, (match, p1) => {
    actionItems.push(p1.trim());
    return ''; 
  });

  processedContent = processedContent.replace(/> 批注：(.*?)(?:\n|$)/g, (match, p1) => {
    comments.push(p1.trim());
    return ''; 
  });

  // 圆环参数
  const radius = 42;
  const stroke = 5;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const scoreColor = score >= 85 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <div className="w-full max-w-7xl mx-auto my-6 font-sans perspective-1000">
      
      {/* 顶部控制栏 (新增) */}
      <div className="flex justify-end gap-3 mb-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
        <button className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-full text-sm font-medium text-stone-600 shadow-sm hover:bg-stone-50 transition-colors">
          <Download size={14} /> 导出 PDF
        </button>
        <button className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-full text-sm font-medium text-stone-600 shadow-sm hover:bg-stone-50 transition-colors">
          <Share2 size={14} /> 分享报告
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        
        {/* === 左侧：高保真电子稿纸 (Main Paper) === */}
        <div className="flex-1 w-full bg-[#fdfbf7] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] border border-stone-200/60 rounded-xl overflow-hidden min-h-[850px] relative transition-all duration-500 animate-in slide-in-from-bottom-8 fade-in">
          
          {/* 1. 纸张噪点纹理 (Noise Texture) - 增加真实感的核心 */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-multiply"
               style={{backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`}}>
          </div>

          {/* 顶部状态栏 */}
          <div className="h-12 bg-[#f9f7f1] border-b border-stone-200/80 flex items-center px-6 justify-between select-none relative z-10">
             <div className="flex gap-2 opacity-80">
               <div className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e]"></div>
               <div className="w-3 h-3 rounded-full bg-[#febc2e] border border-[#d89e24]"></div>
               <div className="w-3 h-3 rounded-full bg-[#28c840] border border-[#1aab29]"></div>
             </div>
             <div className="flex items-center gap-2 text-[11px] text-stone-400 font-bold tracking-widest uppercase">
               <PenTool size={12} />
               <span>AI Correction Mode</span>
             </div>
          </div>

          {/* 稿纸格子背景 */}
          <div className="absolute inset-0 top-12 opacity-20 pointer-events-none" 
               style={{
                 backgroundImage: `linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)`,
                 backgroundSize: '40px 40px'
               }}>
          </div>

          {/* 正文内容区 */}
          <div className="p-10 md:p-16 relative z-0">
             {/* 标题 */}
             <div className="text-center mb-14 relative">
                <h1 className="text-3xl md:text-4xl font-bold text-gray-800 tracking-wider font-serif inline-block relative z-10">
                  作文阅卷单
                </h1>
                {/* 标题装饰线 */}
                <div className="absolute bottom-1 left-0 w-full h-3 bg-yellow-200/50 -z-10 -rotate-1 rounded-sm"></div>
             </div>

             <div className="prose prose-lg md:prose-xl max-w-none font-serif text-gray-700 leading-[2.5rem]">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({children}) => <h1 className="text-2xl font-bold text-gray-900 mt-12 mb-6 flex items-center gap-3"><span className="text-red-400 font-handwriting text-3xl">#</span> {children}</h1>,
                    h2: ({children}) => <h2 className="text-xl font-bold text-gray-800 mt-10 mb-4 pl-4 border-l-4 border-red-400/40 bg-gradient-to-r from-red-50 to-transparent py-2 rounded-r-lg">{children}</h2>,
                    
                    p: ({children}) => <p className="indent-[2em] text-justify mb-8">{children}</p>,
                    
                    // 优化：更自然的红笔波浪线
                    strong: ({children}) => (
                      <span className="relative inline-block mx-1 font-bold text-gray-900 cursor-help group decoration-clone">
                        <span className="relative z-10">{children}</span>
                        <svg className="absolute left-0 -bottom-1.5 w-full h-[8px] opacity-90 mix-blend-multiply pointer-events-none overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 10">
                           <path d="M0 5 Q 5 10 10 5 T 20 5 T 30 5 T 40 5 T 50 5 T 60 5 T 70 5 T 80 5 T 90 5 T 100 5" 
                                 fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                        </svg>
                        {/* 悬停 Tooltip */}
                        <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100 whitespace-nowrap shadow-xl z-50 pointer-events-none">
                           ✨ 精彩表达
                           <span className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></span>
                        </span>
                      </span>
                    ),

                    code: ({children}) => {
                       const text = String(children);
                       if (/^\[\d+\]$/.test(text)) {
                         return (
                          <sup className="inline-flex items-center justify-center w-5 h-5 border border-red-500 text-red-600 text-[10px] font-bold rounded-full ml-0.5 align-top bg-red-50/50 mix-blend-multiply transform -rotate-6 shadow-sm" style={{fontFamily: 'var(--font-hand)'}}>
                            {text.replace(/[\[\]]/g, '')}
                          </sup>
                         )
                       }
                       return <code className="bg-stone-100 px-1.5 py-0.5 rounded mx-1 text-sm font-mono text-stone-600 border border-stone-200">{children}</code>
                    },
                    
                    // 引用块 -> 手写红字 (优化排版)
                    blockquote: ({children}) => (
                       <div className="relative my-8 pl-6 py-1 mix-blend-multiply group">
                         <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-[#dc2626] opacity-20 rounded-full group-hover:opacity-40 transition-opacity"></div>
                         <div className="text-[#c02626] font-cursive text-xl md:text-2xl leading-relaxed tracking-wide" style={{fontFamily: 'var(--font-hand)'}}>
                           {children}
                         </div>
                       </div>
                    ),
                  }}
                >
                  {processedContent}
                </ReactMarkdown>
             </div>
          </div>
        </div>


        {/* === 右侧：智能侧边栏 (Sticky & Animated) === */}
        <div className="w-full lg:w-[340px] flex flex-col gap-6 sticky top-6 self-start h-[calc(100vh-2rem)] overflow-y-auto scrollbar-none pb-10 pr-2">
          
          {/* 1. 评分卡片 (进场动画延迟 100ms) */}
          <div className="bg-white p-6 rounded-2xl shadow-[0_10px_30px_-10px_rgba(0,0,0,0.08)] border border-stone-100 flex flex-col items-center relative overflow-hidden group animate-in slide-in-from-right-4 fade-in duration-700 fill-mode-forwards" style={{animationDelay: '100ms'}}>
             {/* 顶部彩色条 */}
             <div className={`absolute top-0 w-full h-1.5 opacity-80 ${score >= 85 ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : score >= 70 ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-rose-400 to-red-500'}`}></div>
             
             <div className="relative w-36 h-36 mt-4 flex items-center justify-center">
                <svg height={radius * 2} width={radius * 2} className="transform -rotate-90 drop-shadow-md">
                  <circle stroke="#f3f4f6" strokeWidth={stroke} fill="transparent" r={normalizedRadius} cx={radius} cy={radius} strokeLinecap="round" />
                  <circle
                    stroke={scoreColor}
                    strokeWidth={stroke}
                    strokeDasharray={circumference + ' ' + circumference}
                    style={{ strokeDashoffset, transition: 'stroke-dashoffset 1.5s cubic-bezier(0.22, 1, 0.36, 1)' }}
                    strokeLinecap="round"
                    fill="transparent"
                    r={normalizedRadius}
                    cx={radius}
                    cy={radius}
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-6xl font-black font-serif tracking-tighter text-gray-800">{score}</span>
                  <span className="text-[10px] text-gray-400 font-bold tracking-[0.2em] mt-1">SCORE</span>
                </div>
             </div>
          </div>

          {/* 2. 老师的总评 (进场动画延迟 300ms) */}
          <div className="relative group animate-in slide-in-from-right-4 fade-in duration-700 fill-mode-forwards" style={{animationDelay: '300ms'}}>
             <div className="absolute inset-0 bg-yellow-100 rounded-xl transform rotate-2 translate-y-1 opacity-60"></div>
             <div className="relative bg-[#fffbeb] p-6 rounded-xl shadow-sm border border-[#fef3c7] transition-transform hover:-translate-y-1 hover:-rotate-1 duration-300">
               <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-red-400 shadow ring-2 ring-white z-10"></div>
               
               <div className="flex items-center gap-2 mb-4 text-yellow-800/50 font-bold uppercase text-[10px] tracking-widest border-b border-yellow-200/50 pb-2">
                 <Quote size={12}/> Teacher's Comment
               </div>
               
               <p className="text-gray-700 font-cursive text-xl leading-relaxed mix-blend-multiply text-justify" style={{fontFamily: 'var(--font-hand)'}}>
                 {comments.length > 0 ? comments[0] : "正在生成深度点评..."}
               </p>
             </div>
          </div>

          {/* 3. 改进建议清单 (进场动画延迟 500ms) */}
          {actionItems.length > 0 && (
            <div className="bg-white p-5 rounded-2xl shadow-[0_8px_20px_-8px_rgba(0,0,0,0.05)] border border-stone-100 animate-in slide-in-from-right-4 fade-in duration-700 fill-mode-forwards" style={{animationDelay: '500ms'}}>
              <h3 className="flex items-center gap-2 font-bold text-gray-700 mb-4 text-xs uppercase tracking-wider pl-1">
                <Sparkles className="w-4 h-4 text-blue-500 fill-blue-100" />
                Action Plan
              </h3>
              <div className="space-y-2">
                {actionItems.map((item, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => toggleItem(idx)}
                    className={`flex gap-3 items-start p-3 rounded-lg transition-all duration-300 cursor-pointer border border-transparent
                      ${checkedItems[idx] ? 'bg-green-50/50 opacity-60' : 'hover:bg-stone-50 hover:border-stone-100'}`}
                  >
                    <div className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                      ${checkedItems[idx] ? 'bg-green-500 border-green-500' : 'border-stone-200 bg-white'}`}>
                      {checkedItems[idx] && <CheckCircle2 size={14} className="text-white" />}
                    </div>
                    <span className={`text-sm leading-relaxed font-medium transition-all
                      ${checkedItems[idx] ? 'text-stone-400 line-through decoration-stone-300' : 'text-gray-600'}`}>
                      {item.replace(/[*_]/g, '')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}