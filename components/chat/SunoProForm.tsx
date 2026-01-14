/**
 * 🎵 Suno V5 专业模式表单 - 科技感深色设计版
 * 
 * 设计特点：
 * - 深色科技主题（参考 ZeBeyond 配色）
 * - 青色/蓝绿色作为主色调
 * - 卡片式四方版块布局
 * - 流畅的交互动效
 * - 全中文界面
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
  Radio
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
// 科技感卡片组件
// ============================================

interface TechCardProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  accentColor?: string
}

const TechCard = ({ 
  title, 
  icon, 
  children, 
  defaultOpen = true, 
  accentColor = "cyan" 
}: TechCardProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const colorMap: Record<string, { border: string; glow: string; icon: string; text: string }> = {
    cyan: {
      border: "border-cyan-500/30",
      glow: "shadow-cyan-500/20",
      icon: "from-cyan-500 to-teal-500",
      text: "text-cyan-400"
    },
    purple: {
      border: "border-purple-500/30",
      glow: "shadow-purple-500/20",
      icon: "from-purple-500 to-pink-500",
      text: "text-purple-400"
    },
    amber: {
      border: "border-amber-500/30",
      glow: "shadow-amber-500/20",
      icon: "from-amber-500 to-orange-500",
      text: "text-amber-400"
    }
  }

  const colors = colorMap[accentColor] || colorMap.cyan

  return (
    <motion.div
      layout
      className={cn(
        "relative rounded-xl border bg-slate-900/80 backdrop-blur-sm overflow-hidden",
        colors.border,
        isOpen && `shadow-lg ${colors.glow}`
      )}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {/* 顶部发光线条 */}
      <div className={cn(
        "absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r",
        `from-transparent via-${accentColor}-500/50 to-transparent`
      )} />
      
      {/* 角落装饰 */}
      <div className={cn(
        "absolute top-0 right-0 w-20 h-20 opacity-30",
        `bg-gradient-to-bl from-${accentColor}-500/20 to-transparent`
      )} />
      
      {/* 标题栏 */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
        whileTap={{ scale: 0.99 }}
      >
        <div className="flex items-center gap-3">
          <motion.div 
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br text-white",
              colors.icon
            )}
            whileHover={{ scale: 1.1, rotate: 5 }}
            animate={isOpen ? { 
              boxShadow: ["0 0 0px rgba(0,255,255,0)", "0 0 20px rgba(0,255,255,0.3)", "0 0 0px rgba(0,255,255,0)"]
            } : {}}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {icon}
          </motion.div>
          <span className="font-semibold text-white">{title}</span>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          className={colors.text}
        >
          <ChevronDown className="h-5 w-5" />
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
    </motion.div>
  )
}

// ============================================
// 模式选择卡片组件 - 科技风格
// ============================================

interface ModeCardProps {
  mode: TaskMode
  icon: React.ReactNode
  title: string
  description: string
  selected: boolean
  onClick: () => void
  gradient: string
}

const ModeCard = ({ mode, icon, title, description, selected, onClick, gradient }: ModeCardProps) => (
  <motion.button
    type="button"
    onClick={onClick}
    className={cn(
      "relative flex flex-col items-center p-4 rounded-xl border transition-all duration-300 overflow-hidden group",
      selected
        ? "border-cyan-500/50 bg-slate-800/80"
        : "border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/60 hover:border-slate-600/50"
    )}
    whileHover={{ scale: 1.02, y: -2 }}
    whileTap={{ scale: 0.98 }}
  >
    {/* 选中时的背景动画 */}
    {selected && (
      <>
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-teal-500/5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
        {/* 扫描线动画 */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-b from-cyan-400/10 via-transparent to-transparent"
          animate={{ y: [-100, 200] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        />
      </>
    )}
    
    {/* 图标 */}
    <motion.div 
      className={cn(
        "relative z-10 flex h-14 w-14 items-center justify-center rounded-xl mb-3 transition-all duration-300",
        selected 
          ? `bg-gradient-to-br ${gradient} shadow-lg` 
          : "bg-slate-700/50 group-hover:bg-slate-700"
      )}
      animate={selected ? { 
        boxShadow: ["0 0 0px rgba(0,255,255,0.3)", "0 0 30px rgba(0,255,255,0.5)", "0 0 0px rgba(0,255,255,0.3)"]
      } : {}}
      transition={{ duration: 1.5, repeat: Infinity }}
    >
      <div className={cn(
        "transition-colors",
        selected ? "text-white" : "text-slate-400 group-hover:text-slate-300"
      )}>
        {icon}
      </div>
    </motion.div>
    
    {/* 文字 */}
    <div className="relative z-10 text-center">
      <p className={cn(
        "font-semibold text-sm transition-colors",
        selected ? "text-cyan-400" : "text-slate-300"
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
    
    {/* 选中标记 */}
    <AnimatePresence>
      {selected && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500"
        >
          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>
      )}
    </AnimatePresence>

    {/* 边框发光效果 */}
    {selected && (
      <motion.div
        className="absolute inset-0 rounded-xl border border-cyan-500/50"
        animate={{ 
          boxShadow: ["0 0 5px rgba(0,255,255,0.2)", "0 0 15px rgba(0,255,255,0.4)", "0 0 5px rgba(0,255,255,0.2)"]
        }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    )}
  </motion.button>
)

// ============================================
// 模型版本选择器 - 科技风格
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
    <div className="grid grid-cols-2 gap-3">
      {models.map((model) => (
        <motion.button
          key={model.value}
          type="button"
          onClick={() => onChange(model.value)}
          className={cn(
            "relative flex flex-col items-start p-3 rounded-lg border transition-all",
            value === model.value
              ? "border-cyan-500/50 bg-slate-800/80"
              : "border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/60"
          )}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {model.badge && value === model.value && (
            <span className="absolute -top-2 -right-2 px-2 py-0.5 text-xs bg-gradient-to-r from-cyan-500 to-teal-500 text-white rounded-full">
              {model.badge}
            </span>
          )}
          <div className="flex items-center gap-2">
            <Radio className={cn(
              "h-4 w-4",
              value === model.value ? "text-cyan-400" : "text-slate-500"
            )} />
            <span className={cn(
              "font-medium text-sm",
              value === model.value ? "text-cyan-400" : "text-slate-300"
            )}>
              {model.label}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 ml-6">{model.description}</p>
          
          {value === model.value && (
            <motion.div
              className="absolute inset-0 rounded-lg border border-cyan-500/30"
              animate={{ 
                boxShadow: ["0 0 5px rgba(0,255,255,0.1)", "0 0 10px rgba(0,255,255,0.2)", "0 0 5px rgba(0,255,255,0.1)"]
              }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
        </motion.button>
      ))}
    </div>
  )
}

// ============================================
// 人声性别选择器 - 科技风格
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
            ? "border-cyan-500/50 bg-slate-800/80"
            : "border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/60",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        whileHover={!disabled ? { scale: 1.02 } : {}}
        whileTap={!disabled ? { scale: 0.98 } : {}}
      >
        <span className="text-xl">{option.icon}</span>
        <span className={cn(
          "font-medium text-sm",
          value === option.value ? "text-cyan-400" : "text-slate-300"
        )}>
          {option.label}
        </span>
        {value === option.value && (
          <motion.div
            className="absolute inset-0 rounded-lg"
            animate={{ 
              boxShadow: ["0 0 5px rgba(0,255,255,0.1)", "0 0 10px rgba(0,255,255,0.2)", "0 0 5px rgba(0,255,255,0.1)"]
            }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </motion.button>
    ))}
  </div>
)

// ============================================
// 科技感输入框
// ============================================

interface TechInputProps {
  label: string
  icon: React.ReactNode
  value: string | number | null
  onChange: (value: string) => void
  placeholder?: string
  type?: "text" | "number" | "textarea"
  rows?: number
  required?: boolean
  hint?: string
}

const TechInput = ({ 
  label, 
  icon, 
  value, 
  onChange, 
  placeholder, 
  type = "text",
  rows = 4,
  required,
  hint
}: TechInputProps) => (
  <div>
    <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
      <span className="text-cyan-400">{icon}</span>
      {label}
      {required && <span className="text-red-400">*</span>}
    </label>
    {type === "textarea" ? (
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={cn(
          "w-full p-3 rounded-lg bg-slate-800/60 border border-slate-700/50",
          "text-slate-200 placeholder:text-slate-500",
          "focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 focus:bg-slate-800/80",
          "outline-none transition-all text-sm resize-none"
        )}
      />
    ) : (
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full p-3 rounded-lg bg-slate-800/60 border border-slate-700/50",
          "text-slate-200 placeholder:text-slate-500",
          "focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 focus:bg-slate-800/80",
          "outline-none transition-all text-sm"
        )}
      />
    )}
    {hint && (
      <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
        <span className="text-cyan-400">💡</span>
        {hint}
      </p>
    )}
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
    
    // 🔥 Cover/Extend 模式必须填写 target_id
    if ((formData.task_mode === "Cover" || formData.task_mode === "Extend") && !formData.target_id.trim()) {
      alert(`${formData.task_mode === "Cover" ? "翻唱" : "续写"}模式需要填写目标任务 ID`)
      return
    }
    
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
    <div className="bg-slate-950/95 rounded-2xl p-4 border border-slate-800/50">
      {/* 标题 */}
      <motion.div 
        className="flex items-center gap-3 mb-6"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500">
          <Music4 className="h-6 w-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">AI 音乐创作</h2>
          <p className="text-sm text-slate-400">Suno V5 专业模式</p>
        </div>
      </motion.div>

      <form onSubmit={handleSubmit} className="space-y-4 max-h-[55vh] overflow-y-auto pr-2 custom-scrollbar">
        {/* 基础设置卡片 */}
        <TechCard
          title="基础设置"
          icon={<Settings2 className="h-5 w-5" />}
          defaultOpen={true}
          accentColor="cyan"
        >
          {/* 创作模式 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
              <Music4 className="h-4 w-4 text-cyan-400" />
              创作模式
              <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              <ModeCard
                mode="Normal"
                icon={<Sparkles className="h-6 w-6" />}
                title="普通模式"
                description="从零开始创作"
                selected={formData.task_mode === "Normal"}
                onClick={() => updateField("task_mode", "Normal")}
                gradient="from-cyan-500 to-teal-500"
              />
              <ModeCard
                mode="Extend"
                icon={<RefreshCw className="h-6 w-6" />}
                title="续写模式"
                description="延长已有歌曲"
                selected={formData.task_mode === "Extend"}
                onClick={() => updateField("task_mode", "Extend")}
                gradient="from-blue-500 to-indigo-500"
              />
              <ModeCard
                mode="Cover"
                icon={<Wand2 className="h-6 w-6" />}
                title="翻唱模式"
                description="改编歌曲风格"
                selected={formData.task_mode === "Cover"}
                onClick={() => updateField("task_mode", "Cover")}
                gradient="from-purple-500 to-pink-500"
              />
            </div>
          </div>

          {/* 模型版本 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
              <Zap className="h-4 w-4 text-cyan-400" />
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
                <TechInput
                  label="目标任务 ID"
                  icon={<Target className="h-4 w-4" />}
                  value={formData.target_id}
                  onChange={(v) => updateField("target_id", v)}
                  placeholder="输入要续写/翻唱的歌曲任务 ID"
                  required
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
                <TechInput
                  label="续写起点（秒）"
                  icon={<Clock className="h-4 w-4" />}
                  value={formData.continue_at}
                  onChange={(v) => updateField("continue_at", v ? Number(v) : null)}
                  placeholder="例如：30"
                  type="number"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </TechCard>

        {/* 风格内容卡片 */}
        <TechCard
          title="风格内容"
          icon={<Palette className="h-5 w-5" />}
          defaultOpen={true}
          accentColor="purple"
        >
          {/* 歌曲标题 */}
          <TechInput
            label="歌曲标题"
            icon={<FileText className="h-4 w-4" />}
            value={formData.title}
            onChange={(v) => updateField("title", v)}
            placeholder="例如：夏日清风"
            hint="给你的歌曲起个名字"
          />

          {/* 提示词/歌词 */}
          <TechInput
            label="提示词 / 歌词"
            icon={<Mic2 className="h-4 w-4" />}
            value={formData.prompt}
            onChange={(v) => updateField("prompt", v)}
            placeholder="描述你想要的音乐风格，或直接输入歌词..."
            type="textarea"
            rows={4}
            required
            hint="描述你想要的音乐风格，或直接输入歌词"
          />

          {/* 音乐风格标签 */}
          <TechInput
            label="音乐风格标签"
            icon={<Hash className="h-4 w-4" />}
            value={formData.style_tags}
            onChange={(v) => updateField("style_tags", v)}
            placeholder="例如：流行, 轻快, 夏日, 民谣"
            hint="用逗号分隔多个标签"
          />

          {/* 负向标签 */}
          <TechInput
            label="负向标签（排除）"
            icon={<Hash className="h-4 w-4" />}
            value={formData.negative_tags}
            onChange={(v) => updateField("negative_tags", v)}
            placeholder="例如：低质量, 噪音, 失真"
            type="textarea"
            rows={2}
          />
        </TechCard>

        {/* 高级参数卡片 */}
        <TechCard
          title="高级参数"
          icon={<Sliders className="h-5 w-5" />}
          defaultOpen={false}
          accentColor="amber"
        >
          {/* 纯音乐开关 */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20">
                {formData.instrumental ? (
                  <VolumeX className="h-5 w-5 text-amber-400" />
                ) : (
                  <Volume2 className="h-5 w-5 text-amber-400" />
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
              className="data-[state=checked]:bg-cyan-500"
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
                  <Mic2 className="h-4 w-4 text-amber-400" />
                  人声性别
                </label>
                <GenderSelector
                  value={formData.vocal_gender}
                  onChange={(v) => updateField("vocal_gender", v)}
                  disabled={formData.instrumental}
                />
                <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                  <span className="text-cyan-400">✨</span>
                  系统将自动匹配最适合的嗓音
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 结束时间 */}
          <TechInput
            label="结束时间（秒）"
            icon={<Clock className="h-4 w-4" />}
            value={formData.end_at}
            onChange={(v) => updateField("end_at", v ? Number(v) : null)}
            placeholder="留空则自动生成完整歌曲"
            type="number"
          />
        </TechCard>

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
              "w-full h-14 rounded-xl text-white font-semibold text-base transition-all duration-300",
              "bg-gradient-to-r from-cyan-500 via-teal-500 to-cyan-500 bg-[length:200%_auto]",
              "hover:bg-right hover:shadow-xl hover:shadow-cyan-500/30",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none",
              "border border-cyan-500/30"
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

      {/* 底部装饰 */}
      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
        <div className="w-8 h-[1px] bg-gradient-to-r from-transparent to-slate-600" />
        <span>Powered by Suno AI</span>
        <div className="w-8 h-[1px] bg-gradient-to-l from-transparent to-slate-600" />
      </div>
    </div>
  )
}

export default SunoProForm
