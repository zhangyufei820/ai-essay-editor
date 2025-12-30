/**
 * 📎 沈翔学校 - 文件预览组件 (File Preview)
 * 
 * 文件上传后的预览组件，支持图片和文档。
 */

"use client"

import { useEffect } from "react"
import { motion, AnimatePresence, type Easing } from "framer-motion"
import { X, FileText, File, Image, Loader2, Check, AlertCircle, Music, Video } from "lucide-react"
import { cn } from "@/lib/utils"
import { brandColors } from "@/lib/design-tokens"

// ============================================
// 类型定义
// ============================================

interface FileItem {
  name: string
  type: string
  size: number
  preview?: string
  progress?: number
  status?: "uploading" | "complete" | "error"
}

interface FilePreviewProps {
  files: FileItem[]
  onRemove: (index: number) => void
  className?: string
}

// ============================================
// 工具函数
// ============================================

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return Image
  if (type.startsWith("video/")) return Video
  if (type.startsWith("audio/")) return Music
  if (type.includes("pdf")) return FileText
  return File
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileExtension(name: string) {
  const parts = name.split(".")
  return parts.length > 1 ? parts.pop()?.toUpperCase() : ""
}

// ============================================
// 动画配置
// ============================================

const easeOut: Easing = [0.33, 1, 0.68, 1]

const itemVariants = {
  hidden: { 
    opacity: 0, 
    scale: 0.8,
    y: 10
  },
  visible: { 
    opacity: 1, 
    scale: 1,
    y: 0,
    transition: { 
      duration: 0.25,
      ease: easeOut
    }
  },
  exit: { 
    opacity: 0, 
    scale: 0.8,
    y: -10,
    transition: { 
      duration: 0.2,
      ease: easeOut
    }
  }
}

// ============================================
// 删除按钮组件
// ============================================

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        "absolute -top-2 -right-2 w-5 h-5 rounded-full",
        "bg-slate-800/70 hover:bg-red-500",
        "text-white flex items-center justify-center",
        "opacity-0 group-hover:opacity-100",
        "transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-red-400"
      )}
    >
      <X className="w-3 h-3" />
    </button>
  )
}

// ============================================
// 进度条组件
// ============================================

function ProgressOverlay({ progress }: { progress?: number }) {
  return (
    <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center rounded-xl">
      <Loader2 className="w-5 h-5 text-white animate-spin" />
      {progress !== undefined && (
        <span className="text-xs text-white mt-1.5 font-medium">
          {progress}%
        </span>
      )}
      {/* 底部进度条 */}
      {progress !== undefined && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
          <motion.div
            className="h-full"
            style={{ backgroundColor: brandColors[500] }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}
    </div>
  )
}

// ============================================
// 完成状态组件
// ============================================

function CompleteOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-green-500/20 flex items-center justify-center rounded-xl"
    >
      <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
        <Check className="w-5 h-5 text-white" />
      </div>
    </motion.div>
  )
}

// ============================================
// 错误状态组件
// ============================================

function ErrorOverlay() {
  return (
    <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center border-2 border-red-400 rounded-xl">
      <div className="text-center">
        <AlertCircle className="w-6 h-6 text-red-500 mx-auto" />
        <span className="text-[10px] text-red-500 mt-1 block">上传失败</span>
      </div>
    </div>
  )
}

// ============================================
// 图片预览卡片
// ============================================

function ImagePreviewCard({ 
  file, 
  onRemove 
}: { 
  file: FileItem
  onRemove: () => void 
}) {
  return (
    <div className="relative w-[120px] h-[80px] rounded-xl overflow-hidden bg-slate-100 group">
      <img
        src={file.preview}
        alt={file.name}
        className="w-full h-full object-cover"
      />
      
      {/* 文件名悬浮层 */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[10px] text-white truncate">{file.name}</p>
      </div>
      
      {/* 上传进度遮罩 */}
      {file.status === "uploading" && (
        <ProgressOverlay progress={file.progress} />
      )}

      {/* 完成状态 */}
      <AnimatePresence>
        {file.status === "complete" && <CompleteOverlay />}
      </AnimatePresence>

      {/* 错误状态 */}
      {file.status === "error" && <ErrorOverlay />}

      {/* 删除按钮 */}
      <RemoveButton onClick={onRemove} />
    </div>
  )
}

// ============================================
// 文档预览卡片
// ============================================

function DocumentPreviewCard({ 
  file, 
  onRemove 
}: { 
  file: FileItem
  onRemove: () => void 
}) {
  const FileIcon = getFileIcon(file.type)
  const extension = getFileExtension(file.name)

  return (
    <div className={cn(
      "relative w-[120px] p-3 rounded-xl bg-slate-50 border group",
      file.status === "error" ? "border-red-300" : "border-slate-100"
    )}>
      {/* 图标容器 */}
      <div className="w-10 h-10 rounded-lg bg-white border border-slate-100 flex items-center justify-center mx-auto mb-2 relative">
        <FileIcon className="w-5 h-5 text-slate-500" />
        {/* 文件类型标签 */}
        {extension && (
          <span className="absolute -bottom-1 -right-1 px-1 py-0.5 text-[8px] font-bold bg-slate-200 text-slate-600 rounded">
            {extension}
          </span>
        )}
      </div>
      
      {/* 文件名 */}
      <p className="text-xs text-slate-600 text-center truncate" title={file.name}>
        {file.name}
      </p>
      
      {/* 文件大小 */}
      <p className="text-[10px] text-slate-400 text-center mt-0.5">
        {formatFileSize(file.size)}
      </p>

      {/* 上传状态指示器 */}
      {file.status === "uploading" && (
        <div className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: brandColors[600] }} />
            {file.progress !== undefined && (
              <span className="text-[10px] text-slate-500 mt-1 block">{file.progress}%</span>
            )}
          </div>
        </div>
      )}

      {/* 完成状态 */}
      <AnimatePresence>
        {file.status === "complete" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-2 right-2"
          >
            <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
              <Check className="w-2.5 h-2.5 text-white" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 错误状态 */}
      {file.status === "error" && (
        <div className="absolute top-2 right-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
        </div>
      )}

      {/* 删除按钮 */}
      <RemoveButton onClick={onRemove} />
    </div>
  )
}

// ============================================
// 文件预览主组件
// ============================================

export function FilePreview({ files, onRemove, className }: FilePreviewProps) {
  // 清理预览 URL
  useEffect(() => {
    return () => {
      files.forEach(file => {
        if (file.preview && file.preview.startsWith("blob:")) {
          URL.revokeObjectURL(file.preview)
        }
      })
    }
  }, [files])

  if (files.length === 0) return null

  return (
    <div className={cn(
      "relative",
      className
    )}>
      {/* 文件列表 */}
      <div className="flex gap-3 overflow-x-auto py-2 scrollbar-hide">
        <AnimatePresence initial={false} mode="popLayout">
          {files.map((file, index) => {
            const isImage = file.type.startsWith("image/") && file.preview

            return (
              <motion.div
                key={`${file.name}-${index}`}
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                layout
                className="shrink-0"
              >
                {isImage ? (
                  <ImagePreviewCard 
                    file={file} 
                    onRemove={() => onRemove(index)} 
                  />
                ) : (
                  <DocumentPreviewCard 
                    file={file} 
                    onRemove={() => onRemove(index)} 
                  />
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* 左侧渐变遮罩（表示可滚动） */}
      {files.length > 2 && (
        <>
          <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-white to-transparent pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-white to-transparent pointer-events-none" />
        </>
      )}
    </div>
  )
}

export default FilePreview
