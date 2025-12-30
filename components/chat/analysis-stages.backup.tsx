"use client"
import { CheckCircle2, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"

interface Stage {
  id: number
  title: string
  description: string
}

const stages: Stage[] = [
  {
    id: 1,
    title: "文档解析",
    description: "正在识别文字内容和图片信息...",
  },
  {
    id: 2,
    title: "智能分析",
    description: "AI正在深度理解文章立意和结构...",
  },
  {
    id: 3,
    title: "全面评估",
    description: "分析语言表达、论证逻辑和创意亮点...",
  },
  {
    id: 4,
    title: "生成建议",
    description: "提炼优点和改进方向，打磨批改报告...",
  },
  {
    id: 5,
    title: "完成批改",
    description: "批改报告已生成，正在为您呈现...",
  },
]

export function AnalysisStages() {
  const [currentStage, setCurrentStage] = useState(0)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const stageInterval = setInterval(() => {
      setCurrentStage((prev) => {
        if (prev < stages.length - 1) {
          return prev + 1
        }
        return prev
      })
    }, 2000)

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        const targetProgress = ((currentStage + 1) / stages.length) * 100
        if (prev < targetProgress) {
          return Math.min(prev + 1, 100)
        }
        return prev
      })
    }, 20)

    return () => {
      clearInterval(stageInterval)
      clearInterval(progressInterval)
    }
  }, [currentStage])

  return (
    <div className="flex items-center justify-center min-h-[500px] p-4">
      <div className="w-full max-w-md">
        <div className="bg-[#f5f1e8] rounded-3xl p-6 shadow-lg border border-amber-200/50">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-700 to-emerald-900 shadow-md">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800">AI 智能批改进行中</h3>
                <p className="text-sm text-gray-600">
                  阶段 {currentStage + 1} / {stages.length}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-gray-800">{Math.round(progress)}%</div>
              <div className="text-xs text-gray-600">已完成</div>
            </div>
          </div>

          <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-green-500 via-yellow-400 to-orange-500 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="space-y-3">
            {stages.map((stage, index) => {
              const isCompleted = index < currentStage
              const isCurrent = index === currentStage

              return (
                <div
                  key={stage.id}
                  className={`flex items-center gap-3 rounded-2xl border p-4 transition-all ${
                    isCurrent
                      ? "border-emerald-300 bg-emerald-50/80 shadow-md"
                      : isCompleted
                        ? "border-emerald-200 bg-white"
                        : "border-gray-200 bg-white/50"
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
                      isCompleted || isCurrent ? "bg-emerald-700" : "bg-gray-300"
                    }`}
                  >
                    <CheckCircle2 className={`h-5 w-5 ${isCompleted || isCurrent ? "text-white" : "text-gray-500"}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-800">{stage.title}</div>
                    <div className="text-sm text-gray-600 truncate">{stage.description}</div>
                  </div>

                  {isCurrent && (
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="h-2 w-2 rounded-full bg-emerald-700 animate-bounce"
                          style={{
                            animationDelay: `${i * 150}ms`,
                            animationDuration: "600ms",
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 border border-amber-200">
            <span className="text-base">💡</span>
            <p className="text-xs text-gray-600 leading-relaxed">AI 正在为您精心打磨批改报告，请稍候片刻...</p>
          </div>
        </div>
      </div>
    </div>
  )
}
