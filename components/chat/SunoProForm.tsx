/**
 * 🎵 Suno V5 专业模式表单 - 科技感深色设计版 V3
 * 
 * 🔥 关键修改：分离歌词和提示词字段
 * - lyrics：歌词（只填这个会走 LLM 优化）
 * - prompt：风格提示词（填了这个会跳过 LLM，直接生成）
 */

"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Settings2, 
  Palette, 
  Sliders, 
  ChevronDown,
  Music4,
  Mic2,
  FileText,
  Sparkles,
  RefreshCw,
  Wand2,
  Clock,
  Volume2,
  VolumeX,
  Send,
  Zap,
  Target,
  Hash,
  Radio,
  PenLine,
  Lightbulb
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"

// ============================================
// 类型定义
// ============================================

export type TaskMode = "Normal" | "Extend" | "Cover"
export type ModelVersion = "chirp-v5" | "chirp-v4" | "chirp-v3-5" | "chirp-v3-0"
export type VocalGender = "m" | "f"

export interface SunoFormData {
  task_mode: TaskMode
  MV: ModelVersion
  prompt: string      // 🔥 风格提示词（填了会跳过 LLM）
  lyrics: string      // 🔥 歌词（只填这个会走 LLM）
  style_tags: string
  title: string
  instrumental: boolean
  target_id: string
  continue_at: number | null
  negative_tags: string
  vocal_gender: VocalGender
  end_at: number | null
}

interface SunoProFormProps {
  onSubmit: (data: SunoFormData) => void
  isLoading?: boolean
  disabled?: boolean
}

// ============================================
// 科技感卡片组件
// ============================================

interface TechCardProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}

const TechCard = ({ title, icon, children, defaultOpen = true }: TechCardProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <motion.div
      layout
      className="relative rounded-xl border border-emerald-500/20 bg-[#0d1117]/80 backdrop-blur-sm overflow-hidden"
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
      
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
        whileTap={{ scale: 0.99 }}
      >
        <div className="flex items-center gap-3">
          <motion.div 
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white"
            whileHover={{ scale: 1.1, rotate: 5 }}
          >
            {icon}
          </motion.div>
          <span className="font-semibold text-white">{title}</span>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          className="text-emerald-400"
        >
          <ChevronDown className="h-5 w-5" />
        </motion.div>
      </motion.button>
      
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-5 pt-2 space-y-5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ============================================
// 模式选择卡片
// ============================================

interface ModeCardProps {
  icon: React.ReactNode
  title: string
  description: string
  selected: boolean
  onClick: () => void
}

const ModeCard = ({ icon, title, description, selected, onClick }: ModeCardProps) => (
  <motion.button
    type="button"
    onClick={onClick}
    className={cn(
      "relative aspect-square flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-300 overflow-hidden group",
      selected
        ? "border-emerald-500/50 bg-emerald-500/10"
        : "border-slate-700/50 bg-[#0d1117]/60 hover:bg-[#161b22] hover:border-slate-600/50"
    )}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
  >
    {selected && (
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-teal-500/5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />
    )}
    
    <motion.div 
      className={cn(
        "relative z-10 flex h-14 w-14 items-center justify-center rounded-xl mb-3 transition-all duration-300",
        selected 
          ? "bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/30" 
          : "bg-slate-800/80 group-hover:bg-slate-700"
      )}
    >
      <div className={cn(
        "transition-colors",
        selected ? "text-white" : "text-slate-400 group-hover:text-slate-300"
      )}>
        {icon}
      </div>
    </motion.div>
    
    <div className="relative z-10 text-center">
      <p className={cn(
        "font-semibold text-sm transition-colors",
        selected ? "text-emerald-400" : "text-slate-300"
      )}>
        {title}
      </p>
      <p className={cn(
        "text-xs mt-1 transition-colors",
        selected ? "text-slate-400" : "text-slate-500"
      )}>
        {description}
      </p>
    </div>
    
    <AnimatePresence>
      {selected && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500"
        >
          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  </motion.button>
)

// ============================================
// 模型选择器
// ============================================

interface ModelSelectorProps {
  value: ModelVersion
  onChange: (value: ModelVersion) => void
}

const models: { value: ModelVersion; label: string; badge?: string; description: string }[] = [
  { value: "chirp-v5", label: "Chirp V5", badge: "最新", description: "旗舰版本，效果最佳" },
  { value: "chirp-v4", label: "Chirp V4", description: "稳定版本，兼容性好" },
  { value: "chirp-v3-5", label: "Chirp V3.5", description: "经典版本" },
  { value: "chirp-v3-0", label: "Chirp V3.0", description: "早期版本" },
]

const ModelSelector = ({ value, onChange }: ModelSelectorProps) => (
  <div className="grid grid-cols-2 gap-3">
    {models.map((model) => (
      <motion.button
        key={model.value}
        type="button"
        onClick={() => onChange(model.value)}
        className={cn(
          "relative flex flex-col items-start p-3 rounded-lg border transition-all",
          value === model.value
            ? "border-emerald-500/50 bg-emerald-500/10"
            : "border-slate-700/50 bg-[#0d1117]/60 hover:bg-[#161b22]"
        )}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {model.badge && value === model.value && (
          <span className="absolute -top-2 -right-2 px-2 py-0.5 text-xs bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-full">
            {model.badge}
          </span>
        )}
        <div className="flex items-center gap-2">
          <Radio className={cn(
            "h-4 w-4",
            value === model.value ? "text-emerald-400" : "text-slate-500"
          )} />
          <span className={cn(
            "font-medium text-sm",
            value === model.value ? "text-emerald-400" : "text-slate-300"
          )}>
            {model.label}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1 ml-6">{model.description}</p>
      </motion.button>
    ))}
  </div>
)

// ============================================
// 人声性别选择器
// ============================================

interface GenderSelectorProps {
  value: VocalGender
  onChange: (value: VocalGender) => void
  disabled?: boolean
}

const GenderSelector = ({ value, onChange, disabled }: GenderSelectorProps) => (
  <div className="flex gap-3">
    {[
      { value: "m" as VocalGender, icon: "👨", label: "男声" },
      { value: "f" as VocalGender, icon: "👩", label: "女声" }
    ].map((option) => (
      <motion.button
        key={option.value}
        type="button"
        disabled={disabled}
        onClick={() => onChange(option.value)}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-all",
          value === option.value
            ? "border-emerald-500/50 bg-emerald-500/10"
            : "border-slate-700/50 bg-[#0d1117]/60 hover:bg-[#161b22]",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        whileHover={!disabled ? { scale: 1.02 } : {}}
        whileTap={!disabled ? { scale: 0.98 } : {}}
      >
        <span className="text-xl">{option.icon}</span>
        <span className={cn(
          "font-medium text-sm",
          value === option.value ? "text-emerald-400" : "text-slate-300"
        )}>
          {option.label}
        </span>
      </motion.button>
    ))}
  </div>
)

// ============================================
// 主表单组件
// ============================================

export function SunoProForm({ onSubmit, isLoading = false, disabled = false }: SunoProFormProps) {
  const [formData, setFormData] = useState<SunoFormData>({
    task_mode: "Normal",
    MV: "chirp-v5",
    prompt: "",       // 🔥 风格提示词
    lyrics: "",       // 🔥 歌词
    style_tags: "",
    title: "",
    instrumental: false,
    target_id: "",
    continue_at: null,
    negative_tags: "",
    vocal_gender: "m",
    end_at: null
  })

  const showTargetId = formData.task_mode === "Extend" || formData.task_mode === "Cover"
  const showContinueAt = formData.task_mode === "Extend"
  
  // 🔥 判断是否会走 LLM：只有歌词，没有 prompt
  const willUseLLM = formData.lyrics.trim() && !formData.prompt.trim()

  const updateField = <K extends keyof SunoFormData>(field: K, value: SunoFormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // 至少填写歌词或提示词
    if (!formData.lyrics.trim() && !formData.prompt.trim()) {
      alert("请至少填写歌词或风格提示词")
      return
    }
    
    if ((formData.task_mode === "Cover" || formData.task_mode === "Extend") && !formData.target_id.trim()) {
      alert(`${formData.task_mode === "Cover" ? "翻唱" : "续写"}模式需要填写目标任务 ID`)
      return
    }
    
    const cleanedData: SunoFormData = {
      ...formData,
      prompt: formData.prompt.trim(),
      lyrics: formData.lyrics.trim(),
      title: formData.title.trim(),
      style_tags: formData.style_tags.trim(),
      negative_tags: formData.negative_tags.trim(),
      target_id: formData.target_id.trim(),
      vocal_gender: formData.vocal_gender.trim() as VocalGender,
      continue_at: formData.continue_at ? Number(formData.continue_at) : null,
      end_at: formData.end_at ? Number(formData.end_at) : null
    }
    
    onSubmit(cleanedData)
  }

  return (
    <div className="relative bg-[#0a0e17] rounded-2xl p-4 md:p-6 border border-slate-800/50 overflow-hidden w-full max-w-none">
      {/* 科技背景灯效果 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px]">
          <div className="absolute inset-0 bg-gradient-radial from-emerald-500/10 via-emerald-500/5 to-transparent rounded-full blur-3xl" />
        </div>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-gradient-to-b from-emerald-500/20 via-emerald-500/5 to-transparent blur-2xl" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(16, 185, 129, 0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(16, 185, 129, 0.1) 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }} />
      </div>

      {/* 标题 */}
      <motion.div 
        className="relative z-10 flex items-center gap-3 mb-6"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/30">
          <Music4 className="h-6 w-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">AI 音乐创作</h2>
          <p className="text-sm text-slate-400">Suno V5 专业模式</p>
        </div>
      </motion.div>

      {/* 🔥 歌词输入框（优先显示，最大） */}
      <motion.div
        className="relative z-10 mb-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className={cn(
          "relative rounded-xl border-2 bg-[#0d1117]/80 p-4 transition-colors",
          willUseLLM 
            ? "border-purple-500/50 hover:border-purple-500/70" 
            : "border-emerald-500/30 hover:border-emerald-500/50"
        )}>
          <label className="flex items-center gap-2 text-sm font-semibold text-emerald-400 mb-3">
            <PenLine className="h-5 w-5" />
            歌词
            <span className="ml-auto text-xs text-slate-500 font-normal flex items-center gap-1">
              {willUseLLM && (
                <span className="text-purple-400 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  将使用 AI 优化
                </span>
              )}
            </span>
          </label>
          <textarea
            value={formData.lyrics}
            onChange={(e) => updateField("lyrics", e.target.value)}
            placeholder="[Verse 1]
阳光洒在海面上
微风轻轻吹过脸庞

[Chorus]
让我们一起飞翔
在这无尽的天空..."
            rows={6}
            className={cn(
              "w-full p-4 rounded-lg bg-[#161b22] border border-slate-700/50",
              "text-slate-200 placeholder:text-slate-500",
              "focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20",
              "outline-none transition-all text-base resize-none leading-relaxed"
            )}
          />
          <p className="text-xs text-emerald-400/60 mt-2 flex items-center gap-1">
            💡 只填歌词会让 AI 自动生成风格；填写下方风格提示词则直接生成
          </p>
        </div>
      </motion.div>

      {/* 🔥 风格提示词（填了会跳过 LLM） */}
      <motion.div
        className="relative z-10 mb-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <div className="relative rounded-xl border border-slate-700/50 bg-[#0d1117]/60 p-4 hover:border-slate-600/50 transition-colors">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-300 mb-3">
            <Lightbulb className="h-5 w-5 text-amber-400" />
            风格提示词
            <span className="text-xs text-slate-500 font-normal">（可选，填写后跳过 AI 优化直接生成）</span>
          </label>
          <input
            type="text"
            value={formData.prompt}
            onChange={(e) => updateField("prompt", e.target.value)}
            placeholder="例如：流行, 轻快, 夏日感, 清新女声"
            className={cn(
              "w-full p-3 rounded-lg bg-[#161b22] border border-slate-700/50",
              "text-slate-200 placeholder:text-slate-500",
              "focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20",
              "outline-none transition-all text-sm"
            )}
          />
        </div>
      </motion.div>

      <form onSubmit={handleSubmit} className="relative z-10 space-y-4 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
        {/* 基础设置卡片 */}
        <TechCard
          title="基础设置"
          icon={<Settings2 className="h-5 w-5" />}
          defaultOpen={true}
        >
          {/* 创作模式 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
              <Music4 className="h-4 w-4 text-emerald-400" />
              创作模式
              <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              <ModeCard
                icon={<Sparkles className="h-6 w-6" />}
                title="普通模式"
                description="从零开始创作"
                selected={formData.task_mode === "Normal"}
                onClick={() => updateField("task_mode", "Normal")}
              />
              <ModeCard
                icon={<RefreshCw className="h-6 w-6" />}
                title="续写模式"
                description="延长已有歌曲"
                selected={formData.task_mode === "Extend"}
                onClick={() => updateField("task_mode", "Extend")}
              />
              <ModeCard
                icon={<Wand2 className="h-6 w-6" />}
                title="翻唱模式"
                description="改编歌曲风格"
                selected={formData.task_mode === "Cover"}
                onClick={() => updateField("task_mode", "Cover")}
              />
            </div>
          </div>

          {/* 模型版本 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
              <Zap className="h-4 w-4 text-emerald-400" />
              模型版本
              <span className="text-red-400">*</span>
            </label>
            <ModelSelector
              value={formData.MV}
              onChange={(v) => updateField("MV", v)}
            />
          </div>

          {/* 条件显示：任务 ID */}
          <AnimatePresence>
            {showTargetId && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                  <Target className="h-4 w-4 text-emerald-400" />
                  目标任务 ID
                  <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.target_id}
                  onChange={(e) => updateField("target_id", e.target.value)}
                  placeholder="输入要续写/翻唱的歌曲任务 ID"
                  className={cn(
                    "w-full p-3 rounded-lg bg-[#161b22] border border-slate-700/50",
                    "text-slate-200 placeholder:text-slate-500",
                    "focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20",
                    "outline-none transition-all text-sm"
                  )}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* 条件显示：续写起点 */}
          <AnimatePresence>
            {showContinueAt && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                  <Clock className="h-4 w-4 text-emerald-400" />
                  续写起点（秒）
                </label>
                <input
                  type="number"
                  value={formData.continue_at ?? ""}
                  onChange={(e) => updateField("continue_at", e.target.value ? Number(e.target.value) : null)}
                  placeholder="例如：30"
                  className={cn(
                    "w-full p-3 rounded-lg bg-[#161b22] border border-slate-700/50",
                    "text-slate-200 placeholder:text-slate-500",
                    "focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20",
                    "outline-none transition-all text-sm"
                  )}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </TechCard>

        {/* 风格内容卡片 */}
        <TechCard
          title="更多选项"
          icon={<Palette className="h-5 w-5" />}
          defaultOpen={false}
        >
          {/* 歌曲标题 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
              <FileText className="h-4 w-4 text-emerald-400" />
              歌曲标题
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="例如：夏日清风"
              className={cn(
                "w-full p-3 rounded-lg bg-[#161b22] border border-slate-700/50",
                "text-slate-200 placeholder:text-slate-500",
                "focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20",
                "outline-none transition-all text-sm"
              )}
            />
          </div>

          {/* 音乐风格标签 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
              <Hash className="h-4 w-4 text-emerald-400" />
              音乐风格标签
            </label>
            <input
              type="text"
              value={formData.style_tags}
              onChange={(e) => updateField("style_tags", e.target.value)}
              placeholder="例如：流行, 轻快, 夏日, 民谣"
              className={cn(
                "w-full p-3 rounded-lg bg-[#161b22] border border-slate-700/50",
                "text-slate-200 placeholder:text-slate-500",
                "focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20",
                "outline-none transition-all text-sm"
              )}
            />
            <p className="text-xs text-slate-500 mt-1.5">💡 用逗号分隔多个标签</p>
          </div>

          {/* 负向标签 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
              <Hash className="h-4 w-4 text-slate-500" />
              负向标签（排除）
            </label>
            <textarea
              value={formData.negative_tags}
              onChange={(e) => updateField("negative_tags", e.target.value)}
              placeholder="例如：低质量, 噪音, 失真"
              rows={2}
              className={cn(
                "w-full p-3 rounded-lg bg-[#161b22] border border-slate-700/50",
                "text-slate-200 placeholder:text-slate-500",
                "focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20",
                "outline-none transition-all text-sm resize-none"
              )}
            />
          </div>
        </TechCard>

        {/* 高级参数卡片 */}
        <TechCard
          title="高级参数"
          icon={<Sliders className="h-5 w-5" />}
          defaultOpen={false}
        >
          {/* 纯音乐开关 */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#161b22] border border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20">
                {formData.instrumental ? (
                  <VolumeX className="h-5 w-5 text-emerald-400" />
                ) : (
                  <Volume2 className="h-5 w-5 text-emerald-400" />
                )}
              </div>
              <div>
                <p className="font-medium text-slate-200">纯音乐模式</p>
                <p className="text-xs text-slate-500">
                  {formData.instrumental ? "仅生成背景音乐" : "包含人声演唱"}
                </p>
              </div>
            </div>
            <Switch
              checked={formData.instrumental}
              onCheckedChange={(v) => updateField("instrumental", v)}
              className="data-[state=checked]:bg-emerald-500"
            />
          </div>

          {/* 人声性别 */}
          <AnimatePresence>
            {!formData.instrumental && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                  <Mic2 className="h-4 w-4 text-emerald-400" />
                  人声性别
                </label>
                <GenderSelector
                  value={formData.vocal_gender}
                  onChange={(v) => updateField("vocal_gender", v)}
                  disabled={formData.instrumental}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* 结束时间 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
              <Clock className="h-4 w-4 text-emerald-400" />
              结束时间（秒）
            </label>
            <input
              type="number"
              value={formData.end_at ?? ""}
              onChange={(e) => updateField("end_at", e.target.value ? Number(e.target.value) : null)}
              placeholder="留空则自动生成完整歌曲"
              className={cn(
                "w-full p-3 rounded-lg bg-[#161b22] border border-slate-700/50",
                "text-slate-200 placeholder:text-slate-500",
                "focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20",
                "outline-none transition-all text-sm"
              )}
            />
          </div>
        </TechCard>

        {/* 🔥 提交按钮 - 显示当前模式 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Button
            type="submit"
            disabled={disabled || isLoading || (!formData.lyrics.trim() && !formData.prompt.trim())}
            className={cn(
              "w-full h-14 rounded-xl text-white font-semibold text-base transition-all duration-300",
              willUseLLM 
                ? "bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500"
                : "bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500",
              "bg-[length:200%_auto] hover:bg-right hover:shadow-xl",
              willUseLLM ? "hover:shadow-purple-500/30" : "hover:shadow-emerald-500/30",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none",
              "border",
              willUseLLM ? "border-purple-500/30" : "border-emerald-500/30"
            )}
          >
            {isLoading ? (
              <motion.div
                className="flex items-center gap-3"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{willUseLLM ? "AI 正在优化创作中..." : "正在生成中..."}</span>
              </motion.div>
            ) : (
              <motion.div 
                className="flex items-center gap-2"
                whileHover={{ scale: 1.02 }}
              >
                <Send className="h-5 w-5" />
                <span>{willUseLLM ? "AI 优化创作" : "开始创作"}</span>
                <Sparkles className="h-4 w-4" />
              </motion.div>
            )}
          </Button>
          
          {/* 模式提示 */}
          <p className="text-xs text-center mt-2 text-slate-500">
            {willUseLLM ? (
              <span className="text-purple-400">🎯 AI 将根据歌词自动生成最佳风格</span>
            ) : formData.prompt.trim() ? (
              <span className="text-amber-400">⚡ 将直接使用您设定的风格生成</span>
            ) : (
              <span>请输入歌词或风格提示词</span>
            )}
          </p>
        </motion.div>
      </form>

      {/* 底部装饰 */}
      <div className="relative z-10 mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
        <div className="w-8 h-[1px] bg-gradient-to-r from-transparent to-emerald-500/30" />
        <span>Powered by Suno AI</span>
        <div className="w-8 h-[1px] bg-gradient-to-l from-transparent to-emerald-500/30" />
      </div>
    </div>
  )
}

export default SunoProForm
