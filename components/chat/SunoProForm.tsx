/**
 * 🎵 Suno V5 专业模式表单 - 毛玻璃设计版
 * 
 * 设计特点：
 * - 毛玻璃效果卡片
 * - 可折叠面板动画
 * - 流畅的交互动效
 * - 现代化 UI 风格
 */

"use client"

import React, { useState, useEffect } from "react"
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
// 毛玻璃卡片组件
// ============================================

interface GlassCardProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  gradient?: string
}

const GlassCard = ({ title, icon, children, defaultOpen = true, gradient = "from-emerald-500/20 to-teal-500/20" }: GlassCardProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <motion.div
      layout
      className="relative rounded-2xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {/* 毛玻璃背景 */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-br opacity-60",
        gradient
      )} />
      <div className="absolute inset-0 backdrop-blur-xl bg-white/70" />
      
      {/* 装饰光效 */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/40 to-transparent rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-emerald-300/30 to-transparent rounded-full blur-xl translate-y-1/2 -translate-x-1/2" />
      
      {/* 内容 */}
      <div className="relative z-10">
        {/* 标题栏 - 可点击 */}
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between p-4 hover:bg-white/30 transition-colors"
          whileTap={{ scale: 0.99 }}
        >
          <div className="flex items-center gap-3">
            <motion.div 
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30"
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              {icon}
            </motion.div>
            <span className="font-semibold text-slate-800">{title}</span>
          </div>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <ChevronDown className="h-5 w-5 text-slate-400" />
          </motion.div>
        </motion.button>
        
        {/* 展开内容 */}
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
      </div>
    </motion.div>
  )
}

// ============================================
// 模式选择卡片组件
// ============================================

interface ModeCardProps {
  mode: TaskMode
  icon: React.ReactNode
  title: string
  description: string
  selected: boolean
  onClick: () => void
  color: string
}

const ModeCard = ({ mode, icon, title, description, selected, onClick, color }: ModeCardProps) => (
  <motion.button
    type="button"
    onClick={onClick}
    className={cn(
      "relative flex flex-col items-center p-4 rounded-2xl border-2 transition-all duration-300 overflow-hidden group",
      selected
        ? "border-transparent shadow-xl"
        : "border-slate-200/50 bg-white/50 hover:bg-white/80 hover:border-slate-300/50"
    )}
    whileHover={{ scale: 1.02, y: -2 }}
    whileTap={{ scale: 0.98 }}
  >
    {/* 选中时的渐变背景 */}
    {selected && (
      <motion.div
        className={cn("absolute inset-0", color)}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      />
    )}
    
    {/* 悬浮光效 */}
    <div className="absolute inset-0 bg-gradient-to-br from-white/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    
    {/* 图标 */}
    <motion.div 
      className={cn(
        "relative z-10 flex h-12 w-12 items-center justify-center rounded-xl mb-3 transition-all duration-300",
        selected 
          ? "bg-white/90 shadow-lg" 
          : "bg-slate-100 group-hover:bg-white"
      )}
      animate={selected ? { scale: [1, 1.1, 1] } : {}}
      transition={{ duration: 0.3 }}
    >
      <div className={cn(
        "transition-colors",
        selected ? "text-emerald-600" : "text-slate-400 group-hover:text-slate-600"
      )}>
        {icon}
      </div>
    </motion.div>
    
    {/* 文字 */}
    <div className="relative z-10 text-center">
      <p className={cn(
        "font-semibold text-sm transition-colors",
        selected ? "text-white" : "text-slate-700"
      )}>
        {title}
      </p>
      <p className={cn(
        "text-xs mt-1 transition-colors",
        selected ? "text-white/80" : "text-slate-500"
      )}>
        {description}
      </p>
    </div>
    
    {/* 选中标记 */}
    <AnimatePresence>
      {selected && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-lg"
        >
          <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  </motion.button>
)

// ============================================
// 模型版本选择器 - 使用原生 select 避免裁剪问题
// ============================================

interface ModelSelectorProps {
  value: ModelVersion
  onChange: (value: ModelVersion) => void
}

const models: { value: ModelVersion; label: string; badge?: string; description: string }[] = [
  { value: "chirp-v5", label: "Chirp V5", badge: "🔥 最新", description: "旗舰版本，效果最佳" },
  { value: "chirp-v4", label: "Chirp V4", description: "稳定版本，兼容性好" },
  { value: "chirp-v3-5", label: "Chirp V3.5", description: "经典版本" },
  { value: "chirp-v3-0", label: "Chirp V3.0", description: "早期版本" },
]

const ModelSelector = ({ value, onChange }: ModelSelectorProps) => {
  const selected = models.find(m => m.value === value)

  return (
    <div className="relative">
      <div className="flex items-center gap-3 p-3 rounded-xl bg-white/80 border border-slate-200/50">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 shrink-0">
          <Zap className="h-4 w-4 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value as ModelVersion)}
            className="w-full bg-transparent border-none outline-none cursor-pointer font-medium text-slate-800 text-sm appearance-none pr-6"
            style={{ backgroundImage: 'none' }}
          >
            {models.map((model) => (
              <option key={model.value} value={model.value}>
                {model.label} {model.badge ? `(${model.badge})` : ''} - {model.description}
              </option>
            ))}
          </select>
          <p className="text-xs text-emerald-600 mt-0.5">{selected?.description}</p>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 pointer-events-none" />
      </div>
    </div>
  )
}

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
      { value: "m" as VocalGender, icon: "🎤", label: "男声" },
      { value: "f" as VocalGender, icon: "🎤", label: "女声" }
    ].map((option) => (
      <motion.button
        key={option.value}
        type="button"
        disabled={disabled}
        onClick={() => onChange(option.value)}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all",
          value === option.value
            ? "border-emerald-500 bg-emerald-50 shadow-lg shadow-emerald-500/20"
            : "border-slate-200/50 bg-white/50 hover:bg-white/80",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        whileHover={!disabled ? { scale: 1.02 } : {}}
        whileTap={!disabled ? { scale: 0.98 } : {}}
      >
        <span className="text-lg">{option.icon}</span>
        <span className={cn(
          "font-medium text-sm",
          value === option.value ? "text-emerald-700" : "text-slate-600"
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
    prompt: "",
    style_tags: "",
    title: "",
    instrumental: false,
    target_id: "",
    continue_at: null,
    negative_tags: "",
    vocal_gender: "m",
    end_at: null
  })

  // 显示条件字段
  const showTargetId = formData.task_mode === "Extend" || formData.task_mode === "Cover"
  const showContinueAt = formData.task_mode === "Extend"

  // 更新表单数据
  const updateField = <K extends keyof SunoFormData>(field: K, value: SunoFormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // 提交处理
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // 数据清洗
    const cleanedData: SunoFormData = {
      ...formData,
      prompt: formData.prompt.trim(),
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
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
      {/* 基础设置卡片 */}
      <GlassCard
        title="基础设置"
        icon={<Settings2 className="h-5 w-5" />}
        defaultOpen={true}
        gradient="from-emerald-500/20 to-teal-500/20"
      >
        {/* 创作模式 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
            <Music4 className="h-4 w-4 text-emerald-500" />
            创作模式
            <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-3 gap-3">
            <ModeCard
              mode="Normal"
              icon={<Sparkles className="h-5 w-5" />}
              title="普通模式"
              description="从零开始创作新歌曲"
              selected={formData.task_mode === "Normal"}
              onClick={() => updateField("task_mode", "Normal")}
              color="bg-gradient-to-br from-emerald-500 to-teal-500"
            />
            <ModeCard
              mode="Extend"
              icon={<RefreshCw className="h-5 w-5" />}
              title="续写模式"
              description="基于已有歌曲续写延长"
              selected={formData.task_mode === "Extend"}
              onClick={() => updateField("task_mode", "Extend")}
              color="bg-gradient-to-br from-blue-500 to-indigo-500"
            />
            <ModeCard
              mode="Cover"
              icon={<Wand2 className="h-5 w-5" />}
              title="翻唱模式"
              description="改编已有歌曲的风格"
              selected={formData.task_mode === "Cover"}
              onClick={() => updateField("task_mode", "Cover")}
              color="bg-gradient-to-br from-purple-500 to-pink-500"
            />
          </div>
        </div>

        {/* 模型版本 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
            <Zap className="h-4 w-4 text-emerald-500" />
            模型版本
            <span className="text-red-500">*</span>
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
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Target className="h-4 w-4 text-blue-500" />
                目标任务 ID
              </label>
              <input
                type="text"
                value={formData.target_id}
                onChange={(e) => updateField("target_id", e.target.value)}
                placeholder="输入要续写/翻唱的歌曲任务 ID"
                className="w-full p-3 rounded-xl bg-white/80 border border-slate-200/50 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none transition-all text-sm"
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
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Clock className="h-4 w-4 text-blue-500" />
                续写起点（秒）
              </label>
              <input
                type="number"
                value={formData.continue_at ?? ""}
                onChange={(e) => updateField("continue_at", e.target.value ? Number(e.target.value) : null)}
                placeholder="例如：30"
                min={0}
                className="w-full p-3 rounded-xl bg-white/80 border border-slate-200/50 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none transition-all text-sm"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* 风格内容卡片 */}
      <GlassCard
        title="风格内容"
        icon={<Palette className="h-5 w-5" />}
        defaultOpen={true}
        gradient="from-violet-500/20 to-purple-500/20"
      >
        {/* 歌曲标题 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
            <FileText className="h-4 w-4 text-violet-500" />
            歌曲标题
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="例如：夏日清风"
            className="w-full p-3 rounded-xl bg-white/80 border border-slate-200/50 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none transition-all text-sm"
          />
          <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
            <span className="text-violet-400">💡</span>
            给你的歌曲起个名字
          </p>
        </div>

        {/* 提示词/歌词 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
            <Mic2 className="h-4 w-4 text-violet-500" />
            提示词 / 歌词
            <span className="text-red-500">*</span>
          </label>
          <textarea
            value={formData.prompt}
            onChange={(e) => updateField("prompt", e.target.value)}
            placeholder="例如：一首充满阳光气息的夏日流行曲，节奏轻快，让人想起海边漫步的美好时光..."
            rows={4}
            className="w-full p-3 rounded-xl bg-white/80 border border-slate-200/50 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none transition-all text-sm resize-none"
          />
          <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
            <span className="text-violet-400">💡</span>
            描述你想要的音乐风格，或直接输入歌词
          </p>
        </div>

        {/* 音乐风格标签 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
            <Hash className="h-4 w-4 text-violet-500" />
            音乐风格标签
          </label>
          <input
            type="text"
            value={formData.style_tags}
            onChange={(e) => updateField("style_tags", e.target.value)}
            placeholder="例如：pop, upbeat, summer, acoustic"
            className="w-full p-3 rounded-xl bg-white/80 border border-slate-200/50 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none transition-all text-sm"
          />
          <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
            <span className="text-violet-400">💡</span>
            用逗号分隔多个标签
          </p>
        </div>

        {/* 负向标签 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
            <Hash className="h-4 w-4 text-slate-400" />
            负向标签（排除）
          </label>
          <textarea
            value={formData.negative_tags}
            onChange={(e) => updateField("negative_tags", e.target.value)}
            placeholder="例如：low quality, noise, distorted"
            rows={2}
            className="w-full p-3 rounded-xl bg-white/80 border border-slate-200/50 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none transition-all text-sm resize-none"
          />
        </div>
      </GlassCard>

      {/* 高级参数卡片 */}
      <GlassCard
        title="高级参数"
        icon={<Sliders className="h-5 w-5" />}
        defaultOpen={false}
        gradient="from-amber-500/20 to-orange-500/20"
      >
        {/* 纯音乐开关 */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-orange-100">
              {formData.instrumental ? (
                <VolumeX className="h-5 w-5 text-amber-600" />
              ) : (
                <Volume2 className="h-5 w-5 text-amber-600" />
              )}
            </div>
            <div>
              <p className="font-medium text-slate-700">纯音乐模式</p>
              <p className="text-xs text-slate-500">
                {formData.instrumental ? "仅生成背景音乐" : "包含人声演唱"}
              </p>
            </div>
          </div>
          <Switch
            checked={formData.instrumental}
            onCheckedChange={(v) => updateField("instrumental", v)}
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
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Mic2 className="h-4 w-4 text-amber-500" />
                人声性别
              </label>
              <GenderSelector
                value={formData.vocal_gender}
                onChange={(v) => updateField("vocal_gender", v)}
                disabled={formData.instrumental}
              />
              <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                <span className="text-amber-400">✨</span>
                系统将自动匹配最适合的嗓音
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 结束时间 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
            <Clock className="h-4 w-4 text-amber-500" />
            结束时间（秒）
          </label>
          <input
            type="number"
            value={formData.end_at ?? ""}
            onChange={(e) => updateField("end_at", e.target.value ? Number(e.target.value) : null)}
            placeholder="留空则自动生成完整歌曲"
            min={0}
            className="w-full p-3 rounded-xl bg-white/80 border border-slate-200/50 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all text-sm"
          />
        </div>
      </GlassCard>

      {/* 提交按钮 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Button
          type="submit"
          disabled={disabled || isLoading || !formData.prompt.trim()}
          className={cn(
            "w-full h-14 rounded-2xl text-white font-semibold text-base transition-all duration-300",
            "bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500 bg-[length:200%_auto]",
            "hover:bg-right hover:shadow-xl hover:shadow-emerald-500/30",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
          )}
        >
          {isLoading ? (
            <motion.div
              className="flex items-center gap-3"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>AI 正在创作中...</span>
            </motion.div>
          ) : (
            <motion.div 
              className="flex items-center gap-2"
              whileHover={{ scale: 1.02 }}
            >
              <Send className="h-5 w-5" />
              <span>开始创作</span>
              <Sparkles className="h-4 w-4" />
            </motion.div>
          )}
        </Button>
      </motion.div>
    </form>
  )
}

export default SunoProForm
