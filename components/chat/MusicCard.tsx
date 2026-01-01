/**
 * 🎵 MusicCard 组件 - Suno 音乐生成卡片
 * 
 * 功能：
 * 1. 加载中状态：显示旋转动画和进度提示
 * 2. 成功状态：显示专辑封面和音频播放器
 * 3. 错误状态：显示错误信息
 * 
 * ⚠️ 安全协议：此组件完全独立，不影响任何现有功能
 */

"use client"

import React, { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Music, 
  Loader2, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX,
  AlertCircle,
  Download,
  RefreshCw
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { MusicGenerationStatus, MusicGenerationResult } from "@/lib/suno-config"

// 🔥 品牌深绿色
const BRAND_GREEN = "#14532d"
const SUNO_PINK = "#db2777"

// ============================================
// 类型定义
// ============================================

interface MusicCardProps {
  /** 任务 ID */
  taskId: string
  /** 当前状态 */
  status: MusicGenerationStatus
  /** 音频 URL（成功时） */
  audioUrl?: string
  /** 封面 URL（成功时） */
  coverUrl?: string
  /** 歌曲标题 */
  title?: string
  /** 时长（秒） */
  duration?: number
  /** 错误信息 */
  errorMessage?: string
  /** 重试回调 */
  onRetry?: () => void
  /** 自定义类名 */
  className?: string
}

// ============================================
// 加载状态提示文案
// ============================================

const LOADING_MESSAGES = [
  "正在谱写旋律...",
  "AI 正在创作中...",
  "灵感涌现中...",
  "音符跳动中...",
  "即将完成...",
]

// ============================================
// 主组件
// ============================================

export function MusicCard({
  taskId,
  status,
  audioUrl,
  coverUrl,
  title,
  duration,
  errorMessage,
  onRetry,
  className,
}: MusicCardProps) {
  // 加载文案轮换
  const [loadingIndex, setLoadingIndex] = useState(0)
  
  useEffect(() => {
    if (status === "PENDING" || status === "PROCESSING") {
      const timer = setInterval(() => {
        setLoadingIndex((prev) => (prev + 1) % LOADING_MESSAGES.length)
      }, 3000)
      return () => clearInterval(timer)
    }
  }, [status])

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white shadow-sm",
        "transition-all duration-300",
        className
      )}
    >
      <AnimatePresence mode="wait">
        {/* 加载中状态 */}
        {(status === "PENDING" || status === "PROCESSING") && (
          <LoadingState 
            key="loading" 
            message={LOADING_MESSAGES[loadingIndex]} 
          />
        )}

        {/* 成功状态 */}
        {status === "SUCCESS" && audioUrl && (
          <SuccessState
            key="success"
            audioUrl={audioUrl}
            coverUrl={coverUrl}
            title={title}
            duration={duration}
          />
        )}

        {/* 错误状态 */}
        {status === "ERROR" && (
          <ErrorState
            key="error"
            message={errorMessage}
            onRetry={onRetry}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ============================================
// 加载中状态组件
// ============================================

function LoadingState({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col items-center justify-center p-8 min-h-[200px]"
    >
      {/* 音乐波形动画 */}
      <div className="relative mb-6">
        <div 
          className="flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${SUNO_PINK}15` }}
        >
          <Music className="h-8 w-8" style={{ color: SUNO_PINK }} />
        </div>
        
        {/* 脉冲动画 */}
        <div 
          className="absolute inset-0 rounded-2xl animate-ping opacity-20"
          style={{ backgroundColor: SUNO_PINK }}
        />
      </div>

      {/* 音乐波形条 */}
      <div className="flex items-end gap-1 mb-4 h-8">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 rounded-full"
            style={{ backgroundColor: SUNO_PINK }}
            animate={{
              height: ["8px", "24px", "8px"],
            }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              delay: i * 0.1,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* 加载文案 */}
      <motion.p
        key={message}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-sm font-medium text-slate-600"
      >
        {message}
      </motion.p>

      {/* 进度提示 */}
      <p className="mt-2 text-xs text-slate-400">
        音乐生成通常需要 1-3 分钟
      </p>
    </motion.div>
  )
}

// ============================================
// 成功状态组件 - 音乐播放器
// ============================================

function SuccessState({
  audioUrl,
  coverUrl,
  title,
  duration,
}: {
  audioUrl: string
  coverUrl?: string
  title?: string
  duration?: number
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(duration || 0)

  // 播放/暂停
  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  // 静音切换
  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  // 进度条点击
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (audioRef.current && audioDuration > 0) {
      const rect = e.currentTarget.getBoundingClientRect()
      const percent = (e.clientX - rect.left) / rect.width
      audioRef.current.currentTime = percent * audioDuration
    }
  }

  // 时间更新
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleLoadedMetadata = () => setAudioDuration(audio.duration)
    const handleEnded = () => setIsPlaying(false)

    audio.addEventListener("timeupdate", handleTimeUpdate)
    audio.addEventListener("loadedmetadata", handleLoadedMetadata)
    audio.addEventListener("ended", handleEnded)

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate)
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata)
      audio.removeEventListener("ended", handleEnded)
    }
  }, [])

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const progress = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="p-4"
    >
      {/* 隐藏的 audio 元素 */}
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <div className="flex gap-4">
        {/* 封面图 */}
        <div className="relative shrink-0">
          <div 
            className={cn(
              "h-20 w-20 rounded-xl overflow-hidden bg-gradient-to-br from-pink-100 to-purple-100",
              "shadow-md"
            )}
          >
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={title || "音乐封面"}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Music className="h-8 w-8 text-pink-400" />
              </div>
            )}
          </div>
          
          {/* 播放状态指示器 */}
          {isPlaying && (
            <div className="absolute -bottom-1 -right-1 flex items-end gap-0.5 p-1 bg-white rounded-lg shadow-sm">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1 rounded-full bg-pink-500"
                  animate={{ height: ["4px", "12px", "4px"] }}
                  transition={{
                    duration: 0.5,
                    repeat: Infinity,
                    delay: i * 0.1,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* 播放器控制 */}
        <div className="flex-1 min-w-0">
          {/* 标题 */}
          <h4 className="font-medium text-slate-800 truncate mb-1">
            {title || "AI 生成的音乐"}
          </h4>
          
          <p className="text-xs text-slate-400 mb-3">由 Suno V5 生成</p>

          {/* 进度条 */}
          <div
            className="relative h-1.5 bg-slate-100 rounded-full cursor-pointer mb-2 group"
            onClick={handleProgressClick}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all"
              style={{ 
                width: `${progress}%`,
                backgroundColor: SUNO_PINK 
              }}
            />
            {/* 拖动点 */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md border-2 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ 
                left: `${progress}%`,
                borderColor: SUNO_PINK,
                transform: `translateX(-50%) translateY(-50%)`
              }}
            />
          </div>

          {/* 时间和控制按钮 */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {formatTime(currentTime)} / {formatTime(audioDuration)}
            </span>

            <div className="flex items-center gap-2">
              {/* 静音按钮 */}
              <button
                onClick={toggleMute}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                {isMuted ? (
                  <VolumeX className="h-4 w-4 text-slate-400" />
                ) : (
                  <Volume2 className="h-4 w-4 text-slate-400" />
                )}
              </button>

              {/* 播放/暂停按钮 */}
              <button
                onClick={togglePlay}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white shadow-md hover:opacity-90 transition-all"
                style={{ backgroundColor: SUNO_PINK }}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4 ml-0.5" />
                )}
              </button>

              {/* 下载按钮 */}
              <a
                href={audioUrl}
                download={`${title || "suno-music"}.mp3`}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <Download className="h-4 w-4 text-slate-400" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ============================================
// 错误状态组件
// ============================================

function ErrorState({
  message,
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col items-center justify-center p-8 min-h-[200px]"
    >
      <div 
        className="flex h-14 w-14 items-center justify-center rounded-2xl mb-4"
        style={{ backgroundColor: "#fef2f2" }}
      >
        <AlertCircle className="h-7 w-7 text-red-500" />
      </div>

      <p className="text-sm font-medium text-slate-700 mb-1">
        音乐生成失败
      </p>
      
      <p className="text-xs text-slate-400 text-center mb-4 max-w-[200px]">
        {message || "请稍后重试"}
      </p>

      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-all"
          style={{ backgroundColor: SUNO_PINK }}
        >
          <RefreshCw className="h-4 w-4" />
          重新生成
        </button>
      )}
    </motion.div>
  )
}

// ============================================
// 导出默认组件
// ============================================

export default MusicCard
