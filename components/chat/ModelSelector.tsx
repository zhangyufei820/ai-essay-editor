/**
 * 🎯 沈翔智学 - 模型选择器组件 (Model Selector)
 * 
 * 重新设计的AI模型选择下拉菜单，包含流畅动画和统一视觉风格
 */

"use client"

import { useState, useRef, useEffect } from "react"
import { Check, ChevronDown } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

// ============================================
// 设计系统颜色常量
// ============================================

const COLORS = {
  primary: {
    main: "#14532d",
    dark: "#0d3a1f",
    light: "#dcfce7",
    hover: "rgba(20, 83, 45, 0.08)",
  },
  gray: {
    50: "#FAFAFA",
    100: "#F5F5F5",
    200: "#EEEEEE",
    300: "#E0E0E0",
    400: "#BDBDBD",
    500: "#9E9E9E",
    600: "#757575",
    700: "#616161",
    800: "#424242",
    900: "#212121",
  },
  badges: {
    recommended: { bg: "#E8F5E9", text: "#2E7D32" },
    new: { bg: "#E3F2FD", text: "#1976D2" },
    hot: { bg: "#FFF3E0", text: "#F57C00" },
    pro: { bg: "#F3E5F5", text: "#7B1FA2" },
  }
}

// ============================================
// 类型定义
// ============================================

interface Model {
  key: string
  name: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> | string
  color: string
  description?: string
  badge?: string
  group?: string
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
// Badge 组件
// ============================================

function ModelBadge({ text }: { text: string }) {
  const getBadgeStyle = (badgeText: string) => {
    switch (badgeText) {
      case "推荐":
        return { backgroundColor: COLORS.badges.recommended.bg, color: COLORS.badges.recommended.text }
      case "新":
        return { backgroundColor: COLORS.badges.new.bg, color: COLORS.badges.new.text }
      case "热门":
        return { backgroundColor: COLORS.badges.hot.bg, color: COLORS.badges.hot.text }
      case "Pro":
        return { backgroundColor: COLORS.badges.pro.bg, color: COLORS.badges.pro.text }
      default:
        return { backgroundColor: COLORS.gray[100], color: COLORS.gray[600] }
    }
  }

  const style = getBadgeStyle(text)

  return (
    <span 
      className="px-2 py-0.5 text-[10px] font-medium rounded-full"
      style={style}
    >
      {text}
    </span>
  )
}

// ============================================
// 模型选择器主组件
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
      {/* 触发按钮 */}
      <motion.button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg",
          "text-sm hover:bg-[#F5F5F5]",
          "transition-all duration-150 ease-out",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "focus:outline-none"
        )}
        style={{ color: COLORS.gray[700] }}
        whileTap={{ scale: 0.98 }}
      >
        {/* 颜色指示点 */}
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: currentModel?.color }}
        />
        
        {/* 模型名称 */}
        <span className="font-medium">{currentModel?.name || "选择模型"}</span>
        
        {/* 下拉箭头 */}
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <ChevronDown className="w-3.5 h-3.5 opacity-50" />
        </motion.div>
      </motion.button>

      {/* 向上弹出菜单 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute bottom-full left-0 mb-2 z-50"
            style={{
              width: "360px",
              maxHeight: "480px",
              borderRadius: "12px",
              boxShadow: "0 -8px 24px rgba(0,0,0,0.12)",
              backgroundColor: "#FFFFFF",
              border: `1px solid ${COLORS.gray[200]}`,
              overflow: "hidden",
            }}
          >
            {/* 标题和免费额度信息 */}
            <div 
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: `1px solid ${COLORS.gray[200]}` }}
            >
              <span 
                className="text-xs font-medium"
                style={{ color: COLORS.gray[600] }}
              >
                选择模型
              </span>
              {dailyFreeInfo && (
                <span 
                  className="text-[10px]"
                  style={{ color: COLORS.gray[500] }}
                >
                  今日免费: {dailyFreeInfo.total - dailyFreeInfo.used}/{dailyFreeInfo.total}
                </span>
              )}
            </div>

            {/* 可滚动的模型列表 */}
            <div 
              className="overflow-y-auto p-4 custom-scrollbar"
              style={{
                maxHeight: "420px",
              }}
            >

              {groups.map((group, groupIndex) => (
                <div key={group}>
                  {/* 分组标题 */}
                  {group !== "默认" && (
                    <div 
                      className="flex items-center gap-2 mb-2"
                      style={{ 
                        marginTop: groupIndex > 0 ? "16px" : "0",
                      }}
                    >
                      {/* 左侧品牌色条 */}
                      <div 
                        className="w-0.5 h-4 rounded-full"
                        style={{ backgroundColor: COLORS.primary.main }}
                      />
                      <span 
                        className="text-xs font-semibold uppercase"
                        style={{ 
                          color: COLORS.gray[600],
                          letterSpacing: "0.5px",
                        }}
                      >
                        {group}
                      </span>
                    </div>
                  )}

                  {/* 模型列表 */}
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
// 模型菜单项组件
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

  return (
    <motion.button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 rounded-lg cursor-pointer",
        "transition-all duration-150 ease-out",
        "focus:outline-none"
      )}
      style={{
        height: "56px",
        padding: "12px 16px",
        backgroundColor: isSelected ? COLORS.primary.hover : "transparent",
      }}
      whileHover={{ 
        backgroundColor: isSelected ? COLORS.primary.hover : COLORS.gray[100],
      }}
      whileTap={{ scale: 0.98 }}
    >
      {/* 模型图标 */}
      <div 
        className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
        style={{ backgroundColor: `${model.color}15` }}
      >
        {isStringIcon ? (
          <span className="text-lg">{Icon}</span>
        ) : (
          <Icon 
            className="h-4 w-4" 
            style={{ color: model.color }}
          />
        )}
      </div>

      {/* 模型信息 */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <span 
            className="text-sm"
            style={{ 
              fontWeight: 500,
              color: COLORS.gray[900],
            }}
          >
            {model.name}
          </span>
          {model.badge && <ModelBadge text={model.badge} />}
        </div>
        {model.description && (
          <p 
            className="text-xs truncate mt-0.5"
            style={{ 
              fontWeight: 400,
              color: COLORS.gray[600],
            }}
          >
            {model.description}
          </p>
        )}
      </div>

      {/* 选中图标 */}
      {isSelected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <Check 
            className="w-5 h-5 shrink-0" 
            style={{ color: COLORS.primary.main }}
          />
        </motion.div>
      )}
    </motion.button>
  )
}

export default ModelSelector
