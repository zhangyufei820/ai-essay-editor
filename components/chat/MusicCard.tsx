/**
 * 🎵 MusicCard 组件 - Suno 音乐生成卡片
 * 
 * 功能：
 * 1. 加载中状态：显示旋转动画和进度提示
 * 2. 成功状态：显示双曲目播放面板（Suno V5 一次生成两首歌）
 * 3. 错误状态：显示错误信息
 * 
 * 🔥 更新：支持双曲目展示（版本 1 和版本 2）
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
// 类型定义 - 🔥 更新：支持双曲目
// ============================================

interface MusicCardProps {
  /** 任务 ID */
  taskId: string
  /** 当前状态 */
  status: MusicGenerationStatus
  /** 第一首歌音频 URL */
  audioUrl?: string
  /** 第一首歌封面 URL */
  coverUrl?: string
  /** 第二首歌音频 URL（新增） */
  audioUrl2?: string
  /** 第二首歌封面 URL（新增） */
  coverUrl2?: string
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
// 单曲播放器 Props
// ============================================

interface SingleTrackPlayerProps {
  audioUrl: string
  coverUrl?: string
  title?: string
  version: number  // 1 或 2
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
  audioUrl2,
  coverUrl2,
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

        {/* 成功状态 - 🔥 双曲目面板 */}
        {status === "SUCCESS" && audioUrl && (
          <SuccessState
            key="success"
            audioUrl={audioUrl}
            coverUrl={coverUrl}
            audioUrl2={audioUrl2}
            coverUrl2={coverUrl2}
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
// 成功状态组件 - 🔥 双曲目播放面板
// ============================================

function SuccessState({
  audioUrl,
  coverUrl,
  audioUrl2,
  coverUrl2,
  title,
  duration,
}: {
  audioUrl: string
  coverUrl?: string
  audioUrl2?: string
  coverUrl2?: string
  title?: string
  duration?: number
}) {
  // 判断是否有第二首歌
  const hasTwoTracks = !!audioUrl2

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="p-4"
    >
      {/* 标题区域 */}
      <div className="flex items-center gap-2 mb-4">
        <div 
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${SUNO_PINK}15` }}
        >
          <Music className="h-4 w-4" style={{ color: SUNO_PINK }} />
        </div>
        <div>
          <h3 className="font-medium text-slate-800">
            {title || "AI 生成的音乐"}
          </h3>
          <p className="text-xs text-slate-400">
            由 Suno V5 生成 {hasTwoTracks ? "· 2 个版本" : ""}
          </p>
        </div>
      </div>

      {/* 🔥 双曲目网格布局 */}
      <div className={cn(
        "grid gap-4",
        hasTwoTracks ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
      )}>
        {/* 版本 1 */}
        <SingleTrackPlayer
          audioUrl={audioUrl}
          coverUrl={coverUrl}
          title={title}
          version={1}
        />

        {/* 版本 2（如果存在） */}
        {hasTwoTracks && audioUrl2 && (
          <SingleTrackPlayer
            audioUrl={audioUrl2}
            coverUrl={coverUrl2}
            title={title}
            version={2}
          />
        )}
      </div>
    </motion.div>
  )
}

// ============================================
// 单曲播放器组件
// ============================================

function SingleTrackPlayer({
  audioUrl,
  coverUrl,
  title,
  version,
}: SingleTrackPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)

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

  // 版本标签颜色
  const versionColors = {
    1: { bg: "#fef3c7", text: "#d97706", border: "#fcd34d" },
    2: { bg: "#dbeafe", text: "#2563eb", border: "#93c5fd" },
  }
  const colors = versionColors[version as 1 | 2] || versionColors[1]

  return (
    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
      {/* 隐藏的 audio 元素 */}
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* 版本标签 */}
      <div 
        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mb-3"
        style={{ 
          backgroundColor: colors.bg, 
          color: colors.text,
          border: `1px solid ${colors.border}`
        }}
      >
        版本 {version}
      </div>

      <div className="flex gap-3">
        {/* 封面图 */}
        <div className="relative shrink-0">
          <div 
            className={cn(
              "h-16 w-16 rounded-lg overflow-hidden bg-gradient-to-br from-pink-100 to-purple-100",
              "shadow-sm"
            )}
          >
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={`${title || "音乐"} - 版本 ${version}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Music className="h-6 w-6 text-pink-400" />
              </div>
            )}
          </div>
          
          {/* 播放状态指示器 */}
          {isPlaying && (
            <div className="absolute -bottom-1 -right-1 flex items-end gap-0.5 p-1 bg-white rounded-lg shadow-sm">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-0.5 rounded-full bg-pink-500"
                  animate={{ height: ["3px", "10px", "3px"] }}
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
          {/* 进度条 */}
          <div
            className="relative h-1.5 bg-slate-200 rounded-full cursor-pointer mb-2 group"
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
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md border-2 opacity-0 group-hover:opacity-100 transition-opacity"
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

            <div className="flex items-center gap-1">
              {/* 静音按钮 */}
              <button
                onClick={toggleMute}
                className="p-1 rounded-md hover:bg-slate-200 transition-colors"
              >
                {isMuted ? (
                  <VolumeX className="h-3.5 w-3.5 text-slate-400" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5 text-slate-400" />
                )}
              </button>

              {/* 播放/暂停按钮 */}
              <button
                onClick={togglePlay}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white shadow-sm hover:opacity-90 transition-all"
                style={{ backgroundColor: SUNO_PINK }}
              >
                {isPlaying ? (
                  <Pause className="h-3 w-3" />
                ) : (
                  <Play className="h-3 w-3 ml-0.5" />
                )}
              </button>

              {/* 下载按钮 */}
              <a
                href={audioUrl}
                download={`${title || "suno-music"}-v${version}.mp3`}
                className="p-1 rounded-md hover:bg-slate-200 transition-colors"
              >
                <Download className="h-3.5 w-3.5 text-slate-400" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
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
