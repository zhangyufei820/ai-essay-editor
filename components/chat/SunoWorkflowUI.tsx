/**
 * 🎵 Suno V5 工作流可视化 UI 组件
 * 
 * 设计原则：根据 Dify 工作流编排，提供清晰的多步骤创作体验
 * 
 * 工作流程：
 * 1️⃣ 歌词创作阶段：用户输入提示词 → AI 生成歌词
 * 2️⃣ 确认预览阶段：展示歌词预览 → 用户确认或修改
 * 3️⃣ 生成提交阶段：提交到 Suno API → 获取 task_id
 * 4️⃣ 进度查询阶段：轮询状态 → 展示音乐播放卡片
 */

"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Music4, 
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  Edit3,
  Send,
  Play,
  Clock,
  Wand2,
  FileText,
  ChevronRight,
  ArrowRight,
  Mic2,
  Hash
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// ============================================
// 类型定义
// ============================================

export type WorkflowStage = 
  | "idle"           // 初始状态
  | "composing"      // 歌词创作中
  | "preview"        // 歌词预览（等待确认）
  | "submitting"     // 提交中
  | "generating"     // 音乐生成中
  | "complete"       // 生成完成
  | "error"          // 出错

export interface LyricsPreview {
  title?: string
  lyrics: string
  stylePrompt?: string
  styleTags?: string[]
  canEdit?: boolean
}

export interface GenerationProgress {
  taskId: string
  status: "pending" | "processing" | "success" | "error"
  progress?: number  // 0-100
  estimatedTime?: number  // 预计剩余秒数
  message?: string
}

interface SunoWorkflowUIProps {
  stage: WorkflowStage
  lyricsPreview?: LyricsPreview
  generationProgress?: GenerationProgress
  onConfirmGenerate: () => void
  onEditLyrics: () => void
  onRetry: () => void
  onCheckStatus?: () => void
  className?: string
}

// ============================================
// 步骤指示器组件
// ============================================

const steps = [
  { id: 1, label: "输入创意", icon: Wand2 },
  { id: 2, label: "歌词创作", icon: FileText },
  { id: 3, label: "确认预览", icon: CheckCircle2 },
  { id: 4, label: "生成音乐", icon: Music4 },
]

const getActiveStep = (stage: WorkflowStage): number => {
  switch (stage) {
    case "idle": return 1
    case "composing": return 2
    case "preview": return 3
    case "submitting":
    case "generating": return 4
    case "complete": return 5
    case "error": return 0
    default: return 1
  }
}

const StepIndicator = ({ stage }: { stage: WorkflowStage }) => {
  const activeStep = getActiveStep(stage)
  
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map((step, index) => {
        const isActive = step.id === activeStep
        const isCompleted = step.id < activeStep
        const Icon = step.icon
        
        return (
          <React.Fragment key={step.id}>
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium transition-all",
                isActive && "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30",
                isCompleted && "bg-emerald-100 text-emerald-700",
                !isActive && !isCompleted && "bg-slate-100 text-slate-400"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{step.label}</span>
            </motion.div>
            {index < steps.length - 1 && (
              <ChevronRight className={cn(
                "h-4 w-4 transition-colors",
                isCompleted ? "text-emerald-400" : "text-slate-300"
              )} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ============================================
// 歌词创作中动画
// ============================================

const ComposingAnimation = () => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="text-center py-8"
  >
    <div className="relative mx-auto w-20 h-20 mb-6">
      {/* 外圈旋转 */}
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-emerald-200"
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />
      {/* 中圈反向旋转 */}
      <motion.div
        className="absolute inset-2 rounded-full border-2 border-dashed border-emerald-300"
        animate={{ rotate: -360 }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      />
      {/* 中心图标 */}
      <div className="absolute inset-4 flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <FileText className="h-6 w-6 text-white" />
        </motion.div>
      </div>
    </div>
    
    <h3 className="text-lg font-semibold text-slate-800 mb-2">AI 正在创作歌词...</h3>
    <p className="text-sm text-slate-500">根据您的创意，生成独特的歌词和风格</p>
    
    {/* 动态文字 */}
    <motion.div
      className="mt-4 flex items-center justify-center gap-2 text-xs text-emerald-600"
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      <Sparkles className="h-3.5 w-3.5" />
      <span>灵感涌现中</span>
    </motion.div>
  </motion.div>
)

// ============================================
// 歌词预览卡片
// ============================================

const LyricsPreviewCard = ({ 
  preview, 
  onConfirm, 
  onEdit 
}: { 
  preview: LyricsPreview
  onConfirm: () => void
  onEdit: () => void
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-200 overflow-hidden"
  >
    {/* 标题栏 */}
    <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800">
            {preview.title || "歌词预览"}
          </h3>
          <p className="text-xs text-slate-500">请确认歌词内容，满意后点击生成</p>
        </div>
      </div>
    </div>
    
    {/* 歌词内容 */}
    <div className="p-5 space-y-4">
      {/* 风格标签 */}
      {preview.styleTags && preview.styleTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {preview.styleTags.map((tag, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium"
            >
              <Hash className="h-3 w-3" />
              {tag}
            </span>
          ))}
        </div>
      )}
      
      {/* 风格提示词 */}
      {preview.stylePrompt && (
        <div className="p-3 rounded-xl bg-slate-100 border border-slate-200">
          <p className="text-xs font-medium text-slate-500 mb-1">风格提示词</p>
          <p className="text-sm text-slate-700 leading-relaxed">{preview.stylePrompt}</p>
        </div>
      )}
      
      {/* 歌词 */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 max-h-[300px] overflow-y-auto">
        <div className="flex items-center gap-2 mb-3">
          <Mic2 className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-medium text-slate-700">歌词</span>
        </div>
        <pre className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap font-sans">
          {preview.lyrics}
        </pre>
      </div>
    </div>
    
    {/* 操作按钮 */}
    <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
      <Button
        variant="outline"
        onClick={onEdit}
        className="flex-1 h-11 rounded-xl text-slate-600 hover:text-slate-800 hover:bg-white"
      >
        <Edit3 className="h-4 w-4 mr-2" />
        修改歌词
      </Button>
      <Button
        onClick={onConfirm}
        className="flex-1 h-11 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 transition-all"
      >
        <CheckCircle2 className="h-4 w-4 mr-2" />
        确认生成
      </Button>
    </div>
  </motion.div>
)

// ============================================
// 提交中动画
// ============================================

const SubmittingAnimation = () => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="text-center py-8"
  >
    <div className="relative mx-auto w-16 h-16 mb-6">
      <motion.div
        className="absolute inset-0 rounded-full bg-emerald-100"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <Send className="h-7 w-7 text-emerald-600" />
      </div>
    </div>
    
    <h3 className="text-lg font-semibold text-slate-800 mb-2">正在提交到 Suno...</h3>
    <p className="text-sm text-slate-500">请稍候，正在将您的创作提交到音乐生成引擎</p>
  </motion.div>
)

// ============================================
// 生成进度卡片
// ============================================

const GenerationProgressCard = ({ 
  progress,
  onCheckStatus 
}: { 
  progress: GenerationProgress
  onCheckStatus?: () => void
}) => {
  const progressPercent = progress.progress || 0
  const statusText = {
    pending: "排队中...",
    processing: "音乐生成中...",
    success: "生成完成！",
    error: "生成失败"
  }[progress.status]
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border border-purple-200 p-6"
    >
      {/* 进度圆环 */}
      <div className="flex items-center gap-6">
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="40" cy="40" r="36" fill="none" stroke="#e2e8f0" strokeWidth="6" />
            <circle cx="40" cy="40" r="36" fill="none" stroke="#8b5cf6" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${progressPercent * 2.26} 226`} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Music4 className="h-7 w-7 text-purple-600" />
          </div>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-800 mb-1">{statusText}</h3>
          <p className="text-xs text-slate-500 mb-2">{progress.message || `任务ID: ${progress.taskId.slice(0, 8)}...`}</p>
          {progress.estimatedTime && (
            <div className="flex items-center gap-1 text-xs text-purple-600">
              <Clock className="h-3 w-3" />
              <span>预计 {progress.estimatedTime} 秒</span>
            </div>
          )}
        </div>
      </div>
      {onCheckStatus && progress.status !== "success" && (
        <Button variant="outline" size="sm" onClick={onCheckStatus} className="mt-4 w-full">
          <RefreshCw className="h-4 w-4 mr-2" />查询进度
        </Button>
      )}
    </motion.div>
  )
}

// ============================================
// 主组件
// ============================================

export const SunoWorkflowUI: React.FC<SunoWorkflowUIProps> = ({
  stage,
  lyricsPreview,
  generationProgress,
  onConfirmGenerate,
  onEditLyrics,
  onRetry,
  onCheckStatus,
  className
}) => {
  return (
    <div className={cn("w-full", className)}>
      <StepIndicator stage={stage} />
      <AnimatePresence mode="wait">
        {stage === "composing" && <ComposingAnimation key="composing" />}
        {stage === "preview" && lyricsPreview && (
          <LyricsPreviewCard key="preview" preview={lyricsPreview} onConfirm={onConfirmGenerate} onEdit={onEditLyrics} />
        )}
        {stage === "submitting" && <SubmittingAnimation key="submitting" />}
        {stage === "generating" && generationProgress && (
          <GenerationProgressCard key="generating" progress={generationProgress} onCheckStatus={onCheckStatus} />
        )}
        {stage === "error" && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
            <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <h3 className="text-lg font-semibold text-slate-800 mb-2">出错了</h3>
            <Button onClick={onRetry} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />重试</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default SunoWorkflowUI
