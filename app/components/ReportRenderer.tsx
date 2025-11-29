import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Quote, Sparkles, AlertCircle, Feather } from 'lucide-react';

interface ReportProps {
  content: string;
}

export default function ReportRenderer({ content }: ReportProps) {
  // === 1. 数据清洗与分离逻辑 ===
  
  // A. 提取分数
  const scoreMatch = content.match(/# SCORE:\s*(\d+)/);
  const score = scoreMatch ? scoreMatch[1] : "Wait";
  
  // B. 分离“正文”和“侧边栏批注”
  // 我们用正则把所有 "> 批注：..." 提取出来放到右边显示
  const comments: string[] = [];
  const cleanContent = content
    .replace(/# SCORE:\s*\d+(\n)?/, '') // 去掉分数行
    .replace(/> 批注：(.*?)(?:\n|$)/g, (match, p1) => {
      comments.push(p1.trim()); // 把批注存起来
      return ''; // 在正文中删掉它，保持左侧干净
    });

  return (
    <div className="w-full max-w-6xl mx-auto my-8 perspective-1000 animate-in fade-in duration-700">
      
      {/* 整体容器：模拟放在木桌上的一张大试卷 */}
      <div className="relative flex flex-col md:flex-row shadow-2xl rounded-sm overflow-hidden bg-[#fdfbf7]">
        
        {/* === 左侧：学生的主卷面 (65% 宽度) === */}
        <div className="md:w-[65%] p-10 md:p-14 border-r border-stone-200/50 paper-grid min-h-[800px]">
          
          {/* 顶部装订线装饰 */}
          <div className="border-b-2 border-red-800/10 pb-6 mb-8 text-center">
             <h1 className="text-4xl font-bold text-gray-800 tracking-widest font-serif">
               作文阅卷单
             </h1>
             <p className="text-gray-400 text-xs mt-2 uppercase tracking-widest">High-End Essay Correction</p>
          </div>

          {/* 正文渲染区 (Markdown 引擎) */}
          <div className="prose prose-lg max-w-none font-serif text-gray-700 leading-loose">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                // 标题样式
                h1: ({children}) => <h1 className="text-2xl font-bold text-gray-900 mt-8 mb-4">{children}</h1>,
                h2: ({children}) => <div className="text-xl font-bold text-gray-800 mt-8 mb-4 border-b border-gray-200 pb-2 flex items-center gap-2"><Feather className="w-5 h-5 text-gray-400"/>{children}</div>,
                
                // 段落：首行缩进 + 两端对齐
                p: ({children}) => <p className="indent-8 text-justify mb-6">{children}</p>,
                
                // 加粗 -> 变成“红笔波浪线”
                strong: ({children}) => (
                  <span className="relative inline-block mx-1 font-bold text-gray-900">
                    {children}
                    <svg className="absolute -bottom-1 left-0 w-full h-[6px]" preserveAspectRatio="none" viewBox="0 0 100 10">
                       <path d="M0 5 Q 5 10 10 5 T 20 5 T 30 5 T 40 5 T 50 5 T 60 5 T 70 5 T 80 5 T 90 5 T 100 5" fill="none" stroke="#d93025" strokeWidth="2" />
                    </svg>
                  </span>
                ),

                // 引用块 -> 在正文里如果不小心还有残留，就显示为行间红字
                blockquote: ({children}) => (
                   <div className="text-[#d93025] font-cursive text-lg my-4 pl-4 border-l-4 border-[#d93025]/30 bg-[#d93025]/5 p-2 rounded-r">
                     {children}
                   </div>
                ),

                // 列表
                ul: ({children}) => <ul className="list-disc pl-5 space-y-2 marker:text-gray-400">{children}</ul>,
                ol: ({children}) => <ol className="list-decimal pl-5 space-y-2 marker:text-gray-400">{children}</ol>,
              }}
            >
              {cleanContent}
            </ReactMarkdown>
          </div>
        </div>


        {/* === 右侧：老师的侧边批注栏 (35% 宽度) === */}
        <div className="md:w-[35%] bg-[#fffcf5] p-6 md:p-8 relative border-l border-dashed border-gray-300">
          
          {/* 1. 分数印章 (绝对定位，但下面留了位置) */}
          <div className="relative z-20 h-40 flex justify-center items-center mb-4">
             <div className="real-stamp border-[6px] border-[#d93025] rounded-full w-32 h-32 flex flex-col items-center justify-center rotate-[-12deg] opacity-90 mix-blend-multiply bg-[#fffcf5]">
                <span className="text-[#d93025] text-xs font-bold tracking-widest">SCORE</span>
                <span className="text-[#d93025] text-6xl font-black font-serif">{score}</span>
                <div className="w-16 h-1 bg-[#d93025] mt-1 rounded-full opacity-50"></div>
             </div>
          </div>

          {/* 2. 批注列表 (自动生成的便利贴) */}
          <div className="space-y-6 relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-red-200/50"></div> {/* 装饰红线 */}
            
            <h3 className="font-bold text-gray-400 text-xs uppercase tracking-widest pl-8 mb-6">Teacher's Notes</h3>

            {comments.length > 0 ? (
              comments.map((note, index) => (
                <div key={index} className="relative group ml-4 transform hover:-translate-y-1 transition-transform duration-300">
                  {/* 便利贴背景 */}
                  <div className={`p-5 rounded-lg shadow-md border-t-4 ${index % 2 === 0 ? 'bg-yellow-50 border-yellow-400' : 'bg-pink-50 border-pink-400'}`}>
                    <div className="flex items-start gap-2">
                      <span className="text-2xl mt-[-4px] select-none opacity-50">
                        {index % 2 === 0 ? '💡' : '✍️'}
                      </span>
                      <p className="text-gray-700 font-medium leading-relaxed font-cursive text-lg" style={{fontFamily: 'var(--font-teacher)'}}>
                        {note}
                      </p>
                    </div>
                  </div>
                  {/* 装饰：图钉效果 */}
                  <div className="absolute -top-3 left-1/2 w-3 h-3 rounded-full bg-red-400 shadow-sm z-10"></div>
                </div>
              ))
            ) : (
              <div className="text-center text-gray-300 italic py-10">等待批注生成...</div>
            )}
          </div>

          {/* 底部签名 */}
          <div className="absolute bottom-8 right-8 text-right opacity-60">
             <div className="font-cursive text-2xl text-gray-600" style={{fontFamily: 'var(--font-teacher)'}}>AI 教研组</div>
             <div className="text-xs font-sans text-gray-400 mt-1">{new Date().toLocaleDateString()}</div>
          </div>

        </div>

      </div>
    </div>
  );
}