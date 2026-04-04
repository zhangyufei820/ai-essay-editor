/**
 * 🎯 沈翔智学 - 模型选择器组件 (Model Selector)
 *
 * "无痕切换"设计 - 扇形放射 / 流体滑出
 * 关键词：视觉缝合、层级引导、极光微光
 */

"use client"

import { useState, useRef, useEffect } from "react"
import { Check, ChevronDown } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { ModelLogo } from "@/components/ModelLogo"
import type { ModelKey } from "@/components/ModelLogo"

// ============================================
// 🎨 Design Tokens - 与 AgentPanel 保持一致
// ============================================

const TOKENS = {
  primary: "#0d3a1f",
  primaryDeep: "#052e16",
  primaryLight: "#14532d",
  aurora: "#86EFAC",
  auroraSoft: "rgba(134, 239, 172, 0.15)",

  surface: {
    white: "#FEFEFA",
    50: "#F8FAF8",
    100: "#F1F5F3",
  },

  text: {
    primary: "rgba(14, 58, 31, 0.90)",
    secondary: "rgba(14, 58, 31, 0.60)",
    tertiary: "rgba(14, 58, 31, 0.40)",
  },

  glass: {
    light: "rgba(255, 255, 255, 0.70)",
    medium: "rgba(255, 255, 255, 0.50)",
    heavy: "rgba(255, 255, 255, 0.25)",
  },

  shadow: {
    soft: "0 4px 24px rgba(14, 58, 31, 0.04), 0 8px 48px rgba(14, 58, 31, 0.02)",
    glow: "0 0 40px rgba(14, 58, 31, 0.08), 0 0 80px rgba(14, 58, 31, 0.04)",
  }
} as const

// ============================================
// 类型定义
// ============================================

interface Model {
  key: string
  name: string
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }> | string
  color: string
  description?: string
  badge?: string
  group?: string
  /** 使用 ModelLogo 组件渲染图标 */
  modelKey?: ModelKey
}

interface ModelSelectorProps {
  selectedModel: string
  onModelChange: (model: string) => void
  models: Model[]
  disabled?: boolean
  className?: string
  dailyFreeInfo?: {
    used: number
    total: number
  }
}

// ============================================
// Badge 组件 - 呼吸光点/呼吸描边风格
// ============================================

function ModelBadge({ text }: { text: string }) {
  // 推荐：绿色呼吸光点，替代文字标签
  if (text === "推荐") {
    return (
      <motion.span
        className="relative w-2 h-2 rounded-full"
        style={{ backgroundColor: TOKENS.aurora }}
        animate={{
          boxShadow: [
            "0 0 4px rgba(134, 239, 172, 0.4)",
            "0 0 8px rgba(134, 239, 172, 0.6)",
            "0 0 4px rgba(134, 239, 172, 0.4)",
          ],
          opacity: [0.7, 1, 0.7],
        }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    )
  }

  const getBadgeStyle = (badgeText: string) => {
    switch (badgeText) {
      case "新":
        return {
          border: "1px solid rgba(14, 58, 31, 0.15)",
          color: TOKENS.text.secondary,
          background: "rgba(14, 58, 31, 0.04)",
        }
      case "热门":
        return {
          border: "1px solid rgba(14, 58, 31, 0.15)",
          color: TOKENS.text.secondary,
          background: "rgba(14, 58, 31, 0.04)",
        }
      case "Pro":
        return {
          border: "1px solid rgba(14, 58, 31, 0.15)",
          color: TOKENS.text.secondary,
          background: "rgba(14, 58, 31, 0.04)",
        }
      default:
        return {
          border: "1px solid rgba(14, 58, 31, 0.1)",
          color: TOKENS.text.tertiary,
          background: "transparent",
        }
    }
  }

  const style = getBadgeStyle(text)

  return (
    <motion.span
      className="relative px-2 py-0.5 text-[10px] font-medium rounded-full tracking-wider"
      style={style}
      transition={{ duration: 0.2 }}
    >
      {text}
    </motion.span>
  )
}

// ============================================
// 模型选择器主组件 - 流体滑出设计
// ============================================

export function ModelSelector({
  selectedModel,
  onModelChange,
  models,
  disabled,
  className,
  dailyFreeInfo
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const currentModel = models.find(m => m.key === selectedModel)

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // 按分组组织模型
  const groupedModels = models.reduce((acc, model) => {
    const group = model.group || "默认"
    if (!acc[group]) acc[group] = []
    acc[group].push(model)
    return acc
  }, {} as Record<string, Model[]>)

  const groups = Object.keys(groupedModels)

  const handleSelect = (modelKey: string) => {
    onModelChange(modelKey)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* 触发按钮 - 纤细胶囊 */}
      <motion.button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all duration-200"
        style={{
          background: isOpen ? "rgba(14, 58, 31, 0.04)" : "transparent",
        }}
        whileHover={{ background: "rgba(14, 58, 31, 0.04)" }}
        whileTap={{ scale: 0.98 }}
      >
        {/* 颜色指示点 - 呼吸光晕 */}
        <motion.span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: currentModel?.color || TOKENS.primary }}
          animate={isOpen ? {
            boxShadow: [
              `0 0 8px ${currentModel?.color || TOKENS.primary}40`,
              `0 0 16px ${currentModel?.color || TOKENS.primary}60`,
              `0 0 8px ${currentModel?.color || TOKENS.primary}40`,
            ],
          } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
        />

        {/* 模型名称 */}
        <span
          className="text-sm font-medium"
          style={{ color: TOKENS.text.primary, letterSpacing: "0.3px" }}
        >
          {currentModel?.name || "选择模型"}
        </span>

        {/* 下拉箭头 - 旋转动画 */}
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <ChevronDown
            className="w-4 h-4"
            style={{ color: TOKENS.text.tertiary, strokeWidth: 1.5 }}
          />
        </motion.div>
      </motion.button>

      {/* 流体滑出面板 - 向上呼出 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scaleY: 0.95 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: 8, scaleY: 0.95 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            className="absolute bottom-full left-0 mb-2 z-50 origin-bottom w-[340px] max-w-[calc(100vw-32px)]"
            style={{
              borderRadius: "16px",
              background: TOKENS.glass.light,
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              border: "1px solid rgba(14, 58, 31, 0.06)",
              boxShadow: TOKENS.shadow.glow,
            }}
          >
            {/* 顶部极光光条 */}
            <motion.div
              className="absolute top-0 left-0 right-0 h-px"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(134, 239, 172, 0.5) 30%, rgba(134, 239, 172, 0.8) 50%, rgba(134, 239, 172, 0.5) 70%, transparent 100%)",
              }}
              animate={{
                opacity: [0.5, 1, 0.5],
              }}
              transition={{ duration: 2.5, repeat: Infinity }}
            />

            {/* 标题和免费额度 */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid rgba(14, 58, 31, 0.04)" }}
            >
              <span
                className="text-xs font-medium tracking-wider"
                style={{ color: TOKENS.text.secondary, letterSpacing: "1px" }}
              >
                选 择 模 型
              </span>
              {dailyFreeInfo && (
                <span
                  className="text-[10px]"
                  style={{ color: TOKENS.text.tertiary, letterSpacing: "0.5px" }}
                >
                  今日免费: {dailyFreeInfo.total - dailyFreeInfo.used}/{dailyFreeInfo.total}
                </span>
              )}
            </div>

            {/* 可滚动的模型列表 */}
            <div
              className="overflow-y-auto p-3"
              style={{ maxHeight: "360px" }}
            >
              {groups.map((group, groupIndex) => (
                <div key={group}>
                  {/* 分组标题 - 弱化处理 */}
                  {group !== "默认" && (
                    <motion.div
                      className="flex items-center gap-2 mb-2"
                      style={{
                        marginTop: groupIndex > 0 ? "12px" : "0",
                      }}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: groupIndex * 0.05 }}
                    >
                      {/* 左侧细线 */}
                      <div
                        className="w-4 h-px"
                        style={{ background: "linear-gradient(90deg, rgba(14, 58, 31, 0.3), transparent)" }}
                      />
                      <span
                        className="text-[10px] font-medium uppercase tracking-widest"
                        style={{
                          color: TOKENS.text.tertiary,
                          letterSpacing: "2px",
                        }}
                      >
                        {group}
                      </span>
                    </motion.div>
                  )}

                  {/* 模型列表 - 卡片式 */}
                  <div className="space-y-1">
                    {groupedModels[group].map((model) => (
                      <ModelMenuItem
                        key={model.key}
                        model={model}
                        isSelected={selectedModel === model.key}
                        onClick={() => handleSelect(model.key)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ============================================
// 模型菜单项组件 - 浮动岛屿风格
// ============================================

function ModelMenuItem({
  model,
  isSelected,
  onClick
}: {
  model: Model
  isSelected: boolean
  onClick: () => void
}) {
  const Icon = model.icon
  const isStringIcon = typeof Icon === 'string'
  const hasModelLogo = !!model.modelKey

  return (
    <motion.button
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-xl cursor-pointer transition-all duration-200"
      style={{
        height: "48px",
        padding: "0 12px",
        background: isSelected
          ? "linear-gradient(135deg, rgba(134, 239, 172, 0.08) 0%, rgba(134, 239, 172, 0.04) 100%)"
          : "transparent",
        border: isSelected
          ? "1px solid rgba(134, 239, 172, 0.15)"
          : "1px solid transparent",
      }}
      whileHover={{
        background: isSelected
          ? "linear-gradient(135deg, rgba(134, 239, 172, 0.1) 0%, rgba(134, 239, 172, 0.05) 100%)"
          : "rgba(14, 58, 31, 0.02)",
      }}
      whileTap={{ scale: 0.98 }}
    >
      {/* 模型图标 - 使用 ModelLogo 或 Lucide 图标 */}
      <div
        className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
        style={{
          background: isSelected
            ? "rgba(134, 239, 172, 0.12)"
            : "rgba(14, 58, 31, 0.04)",
          border: isSelected
            ? "1px solid rgba(134, 239, 172, 0.15)"
            : "1px solid rgba(14, 58, 31, 0.04)",
        }}
      >
        {hasModelLogo ? (
          <ModelLogo modelKey={model.modelKey!} size="md" />
        ) : isStringIcon ? (
          <span className="text-sm">{Icon}</span>
        ) : Icon ? (
          <Icon
            className="h-4 w-4"
            style={{
              color: isSelected ? TOKENS.primaryLight : TOKENS.text.secondary,
              strokeWidth: 1.5,
            }}
          />
        ) : null}
      </div>

      {/* 模型信息 */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1.5">
          <span
            className="text-xs font-medium"
            style={{
              fontWeight: 500,
              color: isSelected ? TOKENS.text.primary : TOKENS.text.secondary,
              letterSpacing: "0.2px",
            }}
          >
            {model.name}
          </span>
          {model.badge && <ModelBadge text={model.badge} />}
        </div>
        {model.description && (
          <p
            className="text-[10px] truncate mt-0.5"
            style={{
              fontWeight: 400,
              color: TOKENS.text.tertiary,
            }}
          >
            {model.description}
          </p>
        )}
      </div>

      {/* 选中图标 - 极光微光 */}
      {isSelected && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <Check
            className="w-4 h-4 shrink-0"
            style={{ color: TOKENS.primaryLight, strokeWidth: 2 }}
          />
        </motion.div>
      )}
    </motion.button>
  )
}

export default ModelSelector
