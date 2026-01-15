/**
 * 🎵 Suno V5 专业模式表单 - Apple Music 风格版
 * 
 * 设计风格：
 * - 简洁大气
 * - 毛玻璃效果 (Glassmorphism)
 * - 柔和渐变
 * - 优雅动画
 * 
 * 🔥 关键功能：
 * - lyrics：歌词（只填这个会走 LLM 优化）
 * - prompt：风格提示词（填了这个会跳过 LLM，直接生成）
 */

"use client"

import React, { useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Music4, 
  Sparkles, 
  ChevronDown,
  Mic2,
  Send,
  Sliders,
  PenLine,
  Lightbulb,
  Wand2,
  RefreshCw,
  Volume2,
  VolumeX,
  Clock,
  Target,
  FileText,
  Hash
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
  prompt: string
  lyrics: string
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
// 毛玻璃折叠卡片组件
// ============================================

interface GlassCardProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  badge?: string
}

const GlassCard = ({ title, icon, children, defaultOpen = true, badge }: GlassCardProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsOpen(prev => !prev)
  }, [])

  return (
    <motion.div
      layout
      className="relative rounded-2xl overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* 毛玻璃背景 */}
      <div className="absolute inset-0 bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl" />
      <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-gray-100/30 dark:from-gray-800/50 dark:to-gray-900/30" />
      
      {/* 边框光效 */}
      <div className="absolute inset-0 rounded-2xl border border-white/40 dark:border-white/10" />
      
      {/* 内容 */}
      <div className="relative">
        <button
          type="button"
          onClick={handleToggle}
          className="w-full flex items-center justify-between p-4 hover:bg-white/30 dark:hover:bg-white/5 transition-all duration-200"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20">
              {icon}
            </div>
            <span className="font-semibold text-gray-800 dark:text-white">{title}</span>
            {badge && (
              <span className="px-2 py-0.5 text-xs font-medium bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-full">
                {badge}
              </span>
            )}
          </div>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-gray-400"
          >
            <ChevronDown className="h-5 w-5" />
          </motion.div>
        </button>
        
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-5 pt-1 space-y-4">
                {children}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ============================================
// 模式选择按钮
// ============================================

interface ModeButtonProps {
  icon: React.ReactNode
  title: string
  subtitle: string
  selected: boolean
  onClick: () => void
}

const ModeButton = ({ icon, title, subtitle, selected, onClick }: ModeButtonProps) => (
  <motion.button
    type="button"
    onClick={onClick}
    className={cn(
      "relative flex flex-col items-center justify-center p-4 rounded-2xl transition-all duration-300",
      "border-2",
      selected
        ? "border-emerald-500/50 bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 shadow-lg shadow-emerald-500/10"
        : "border-gray-200/50 dark:border-gray-700/50 bg-white/40 dark:bg-gray-800/40 hover:bg-white/60 dark:hover:bg-gray-800/60"
    )}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
  >
    <motion.div 
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-xl mb-2 transition-all duration-300",
        selected 
          ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30" 
          : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
      )}
    >
      {icon}
    </motion.div>
    <span className={cn(
      "font-medium text-sm",
      selected ? "text-emerald-600 dark:text-emerald-400" : "text-gray-700 dark:text-gray-300"
    )}>
      {title}
    </span>
    <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</span>
    
    {selected && (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg"
      >
        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </motion.div>
    )}
  </motion.button>
)

// ============================================
// 优雅输入框
// ============================================

interface GlassInputProps {
  label: string
  icon: React.ReactNode
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  multiline?: boolean
  rows?: number
  required?: boolean
}

const GlassInput = ({ 
  label, icon, value, onChange, placeholder, hint, multiline = false, rows = 3, required 
}: GlassInputProps) => (
  <div className="space-y-2">
    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
      {icon}
      {label}
      {required && <span className="text-emerald-500">*</span>}
    </label>
    {multiline ? (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={cn(
          "w-full px-4 py-3 rounded-xl",
          "bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm",
          "border border-gray-200/50 dark:border-gray-700/50",
          "text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500",
          "focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20",
          "outline-none transition-all duration-200 resize-none",
          "text-base leading-relaxed"
        )}
      />
    ) : (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full px-4 py-3 rounded-xl",
          "bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm",
          "border border-gray-200/50 dark:border-gray-700/50",
          "text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500",
          "focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20",
          "outline-none transition-all duration-200"
        )}
      />
    )}
    {hint && (
      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
        <Lightbulb className="h-3 w-3" />
        {hint}
      </p>
    )}
  </div>
)

// ============================================
// 性别选择器
// ============================================

interface GenderSelectorProps {
  value: VocalGender
  onChange: (value: VocalGender) => void
  disabled?: boolean
}

const GenderSelector = ({ value, onChange, disabled }: GenderSelectorProps) => (
  <div className="flex gap-3">
    {[
      { val: "m" as VocalGender, icon: "👨", label: "男声" },
      { val: "f" as VocalGender, icon: "👩", label: "女声" }
    ].map((option) => (
      <motion.button
        key={option.val}
        type="button"
        disabled={disabled}
        onClick={() => onChange(option.val)}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl transition-all duration-200",
          "border-2",
          value === option.val
            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "border-gray-200/50 dark:border-gray-700/50 bg-white/40 dark:bg-gray-800/40 text-gray-600 dark:text-gray-300",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        whileHover={!disabled ? { scale: 1.02 } : {}}
        whileTap={!disabled ? { scale: 0.98 } : {}}
      >
        <span className="text-xl">{option.icon}</span>
        <span className="font-medium">{option.label}</span>
      </motion.button>
    ))}
  </div>
)

// ============================================
// 模型选择器
// ============================================

const models: { value: ModelVersion; label: string; badge?: string }[] = [
  { value: "chirp-v5", label: "V5", badge: "推荐" },
  { value: "chirp-v4", label: "V4" },
  { value: "chirp-v3-5", label: "V3.5" },
  { value: "chirp-v3-0", label: "V3.0" },
]

interface ModelSelectorProps {
  value: ModelVersion
  onChange: (value: ModelVersion) => void
}

const ModelSelector = ({ value, onChange }: ModelSelectorProps) => (
  <div className="flex gap-2">
    {models.map((model) => (
      <motion.button
        key={model.value}
        type="button"
        onClick={() => onChange(model.value)}
        className={cn(
          "flex-1 py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200",
          "border-2",
          value === model.value
            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "border-gray-200/50 dark:border-gray-700/50 bg-white/40 dark:bg-gray-800/40 text-gray-600 dark:text-gray-300 hover:bg-white/60"
        )}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <span>{model.label}</span>
        {model.badge && value === model.value && (
          <span className="ml-1 text-xs opacity-70">✨</span>
        )}
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
    prompt: "",
    lyrics: "",
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
  const willUseLLM = formData.lyrics.trim() && !formData.prompt.trim()

  const updateField = <K extends keyof SunoFormData>(field: K, value: SunoFormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
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
    <div className="relative w-full max-w-2xl mx-auto">
      {/* 背景装饰 */}
      <div className="absolute -inset-4 bg-gradient-to-r from-emerald-500/20 via-emerald-600/20 to-emerald-600/20 rounded-3xl blur-3xl opacity-50" />
      
      <div className="relative rounded-3xl p-6 bg-white/80 dark:bg-gray-900/80 backdrop-blur-2xl border border-white/50 dark:border-gray-800/50 shadow-2xl shadow-gray-200/50 dark:shadow-black/20">
        
        <form onSubmit={handleSubmit} className="space-y-5">
          
          {/* 🎵 歌词输入 */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className={cn(
              "relative rounded-2xl p-5 transition-all duration-300",
              "bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm",
              willUseLLM 
                ? "border-2 border-emerald-600/40 shadow-lg shadow-emerald-600/10" 
                : "border-2 border-gray-200/50 dark:border-gray-700/50"
            )}>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 mb-3">
                <PenLine className="h-4 w-4 text-emerald-500" />
                <span className="font-bold text-base">歌词</span>
                {willUseLLM && (
                  <span className="ml-auto px-2 py-0.5 text-xs bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-full flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    AI 将优化
                  </span>
                )}
              </label>
              <textarea
                value={formData.lyrics}
                onChange={(e) => updateField("lyrics", e.target.value)}
                placeholder="[Verse 1]&#10;阳光洒在海面上&#10;微风轻轻吹过脸庞&#10;&#10;[Chorus]&#10;让我们一起飞翔&#10;在这无尽的天空..."
                rows={6}
                className={cn(
                  "w-full px-4 py-3 rounded-xl",
                  "bg-white/80 dark:bg-gray-900/80",
                  "border border-gray-200/50 dark:border-gray-700/50",
                  "text-gray-800 dark:text-white placeholder:text-gray-400",
                  "focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20",
                  "outline-none transition-all duration-200 resize-none",
                  "text-base leading-relaxed"
                )}
              />
            </div>
          </motion.div>

          {/* 🎨 音乐提示词 */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <div className="relative rounded-2xl p-5 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border-2 border-gray-200/50 dark:border-gray-700/50">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 mb-1">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <span className="font-bold text-base">音乐提示词</span>
                <span className="text-xs font-normal text-gray-400">（可选，填写后跳过 AI 优化）</span>
              </label>
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-3">
                💡 只填歌词会让 AI 自动生成风格；填写音乐提示词则直接生成
              </p>
              <input
                type="text"
                value={formData.prompt}
                onChange={(e) => updateField("prompt", e.target.value)}
                placeholder="例如：流行, 轻快, 夏日感, 清新女声"
                className={cn(
                  "w-full px-4 py-3 rounded-xl",
                  "bg-white/80 dark:bg-gray-900/80",
                  "border border-gray-200/50 dark:border-gray-700/50",
                  "text-gray-800 dark:text-white placeholder:text-gray-400",
                  "focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20",
                  "outline-none transition-all duration-200"
                )}
              />
            </div>
          </motion.div>

          {/* ⚙️ 基础设置 */}
          <GlassCard
            title="基础设置"
            icon={<Sliders className="h-5 w-5" />}
            defaultOpen={true}
          >
            {/* 创作模式 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
                <Music4 className="h-4 w-4 text-emerald-500" />
                创作模式
              </label>
              <div className="grid grid-cols-3 gap-3">
                <ModeButton
                  icon={<Sparkles className="h-5 w-5" />}
                  title="普通"
                  subtitle="从零创作"
                  selected={formData.task_mode === "Normal"}
                  onClick={() => updateField("task_mode", "Normal")}
                />
                <ModeButton
                  icon={<RefreshCw className="h-5 w-5" />}
                  title="续写"
                  subtitle="延长歌曲"
                  selected={formData.task_mode === "Extend"}
                  onClick={() => updateField("task_mode", "Extend")}
                />
                <ModeButton
                  icon={<Wand2 className="h-5 w-5" />}
                  title="翻唱"
                  subtitle="改编风格"
                  selected={formData.task_mode === "Cover"}
                  onClick={() => updateField("task_mode", "Cover")}
                />
              </div>
            </div>

            {/* 模型版本 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
                <Sparkles className="h-4 w-4 text-emerald-500" />
                模型版本
              </label>
              <ModelSelector
                value={formData.MV}
                onChange={(v) => updateField("MV", v)}
              />
            </div>

            {/* 目标任务 ID */}
            <AnimatePresence>
              {showTargetId && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <GlassInput
                    label="目标任务 ID"
                    icon={<Target className="h-4 w-4 text-emerald-500" />}
                    value={formData.target_id}
                    onChange={(v) => updateField("target_id", v)}
                    placeholder="输入要续写/翻唱的歌曲任务 ID"
                    required
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* 续写起点 */}
            <AnimatePresence>
              {showContinueAt && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <GlassInput
                    label="续写起点（秒）"
                    icon={<Clock className="h-4 w-4 text-emerald-500" />}
                    value={formData.continue_at?.toString() || ""}
                    onChange={(v) => updateField("continue_at", v ? Number(v) : null)}
                    placeholder="例如：30"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>

          {/* 🎨 更多选项 */}
          <GlassCard
            title="更多选项"
            icon={<FileText className="h-5 w-5" />}
            defaultOpen={false}
          >
            <GlassInput
              label="歌曲标题"
              icon={<FileText className="h-4 w-4 text-emerald-500" />}
              value={formData.title}
              onChange={(v) => updateField("title", v)}
              placeholder="例如：夏日清风"
            />
            
            <GlassInput
              label="音乐风格标签"
              icon={<Hash className="h-4 w-4 text-emerald-500" />}
              value={formData.style_tags}
              onChange={(v) => updateField("style_tags", v)}
              placeholder="例如：流行, 轻快, 夏日, 民谣, 摇滚, 电子, R&B, 嘻哈, 古典, 爵士, 乡村, 抒情, 动感, 治愈"
              hint="用逗号分隔多个标签"
            />
            
            <GlassInput
              label="负向标签（排除）"
              icon={<Hash className="h-4 w-4 text-gray-400" />}
              value={formData.negative_tags}
              onChange={(v) => updateField("negative_tags", v)}
              placeholder="例如：低质量, 噪音, 失真, 单调, 沉闷, 杂音, 模糊, 过度混响"
            />
          </GlassCard>

          {/* 🎚️ 高级参数 */}
          <GlassCard
            title="高级参数"
            icon={<Sliders className="h-5 w-5" />}
            defaultOpen={false}
          >
            {/* 纯音乐开关 */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/60 dark:bg-gray-800/60 border border-gray-200/50 dark:border-gray-700/50">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                  {formData.instrumental ? (
                    <VolumeX className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <Volume2 className="h-5 w-5 text-emerald-500" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-gray-800 dark:text-white">纯音乐模式</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
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
                  transition={{ duration: 0.2 }}
                >
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                      <Mic2 className="h-4 w-4 text-emerald-500" />
                      人声性别
                    </label>
                    <GenderSelector
                      value={formData.vocal_gender}
                      onChange={(v) => updateField("vocal_gender", v)}
                      disabled={formData.instrumental}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 结束时间 */}
            <GlassInput
              label="结束时间（秒）"
              icon={<Clock className="h-4 w-4 text-emerald-500" />}
              value={formData.end_at?.toString() || ""}
              onChange={(v) => updateField("end_at", v ? Number(v) : null)}
              placeholder="留空则自动生成完整歌曲"
            />
          </GlassCard>

          {/* 🚀 提交按钮 */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="pt-2"
          >
            <Button
              type="submit"
              disabled={disabled || isLoading || (!formData.lyrics.trim() && !formData.prompt.trim())}
              className={cn(
                "w-full h-14 rounded-2xl font-semibold text-base transition-all duration-300",
                "text-white shadow-xl",
                willUseLLM 
                  ? "bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 shadow-emerald-600/30 hover:shadow-emerald-600/50"
                  : "bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-500 shadow-emerald-500/30 hover:shadow-emerald-500/50",
                "bg-[length:200%_auto] hover:bg-right",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
              )}
            >
              {isLoading ? (
                <motion.div
                  className="flex items-center gap-3"
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{willUseLLM ? "AI 正在优化创作..." : "正在生成..."}</span>
                </motion.div>
              ) : (
                <motion.div 
                  className="flex items-center justify-center gap-2"
                  whileHover={{ scale: 1.02 }}
                >
                  <Send className="h-5 w-5" />
                  <span>开始创作</span>
                  <Sparkles className="h-4 w-4" />
                </motion.div>
              )}
            </Button>
            
            <p className="text-xs text-center mt-3 text-gray-500 dark:text-gray-400">
              {willUseLLM ? (
                <span className="text-emerald-600 dark:text-emerald-400">
                  ✨ AI 将根据歌词自动生成最佳风格
                </span>
              ) : formData.prompt.trim() ? (
                <span className="text-amber-500 dark:text-amber-400">
                  ⚡ 将直接使用您设定的风格生成
                </span>
              ) : (
                <span>请输入歌词或风格提示词</span>
              )}
            </p>
          </motion.div>
        </form>

        {/* 底部装饰 */}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <div className="w-8 h-[1px] bg-gradient-to-r from-transparent to-gray-300 dark:to-gray-700" />
          <span>Powered by Suno AI</span>
          <div className="w-8 h-[1px] bg-gradient-to-l from-transparent to-gray-300 dark:to-gray-700" />
        </div>
      </div>
    </div>
  )
}

export default SunoProForm
