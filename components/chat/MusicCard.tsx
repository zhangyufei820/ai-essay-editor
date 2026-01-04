/**
 * 🎵 MusicCard 组件 - Suno 音乐生成卡片
 * 
 * 功能：
 * 1. 加载中状态：显示"音乐正在创作中"动画
 * 2. 成功状态：显示双曲目播放面板（网页内播放）
 * 3. 错误状态：显示错误信息
 * 4. 下载功能：下载到本地
 * 
 * 🔥 更新：
 * - 封面放大两倍
 * - 加载中显示"音乐正在创作中"
 * - 网页内播放（不跳转）
 * - 下载到本地功能
 */

"use client"

import React, { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Music, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX,
  AlertCircle,
  Download,
  RefreshCw,
  Sparkles,
  Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { MusicGenerationStatus, SongSlot } from "@/lib/suno-config"

// 🔥 品牌深绿色（与主网站一致）
const BRAND_GREEN = "#14532d"

// ============================================
// 类型定义
// ============================================

interface MusicCardProps {
  taskId: string
  songs: [SongSlot, SongSlot]
  globalStatus?: MusicGenerationStatus
  errorMessage?: string
  onRetry?: () => void
  className?: string
}

interface SingleTrackPlayerProps {
  audioUrl: string
  coverUrl?: string
  title?: string
  version: number
}

// ============================================
// 主组件 - 高端大气版本
// ============================================

export function MusicCard({
  taskId,
  songs,
  globalStatus,
  errorMessage,
  onRetry,
  className,
}: MusicCardProps) {
  // 判断是否有任何槽位在加载
  const hasLoadingSlot = songs.some(s => s.status === "loading")
  const hasReadySlot = songs.some(s => s.status === "ready")

  // 全局错误状态
  if (globalStatus === "ERROR" && !hasReadySlot) {
    return (
      <div className={cn(
        "relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm",
        className
      )}>
        <ErrorState message={errorMessage} onRetry={onRetry} />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50/80 to-white shadow-sm",
        "transition-all duration-300",
        className
      )}
    >
      <div className="p-5">
        {/* 🔥 简洁标题：由 Suno V5 生成 */}
        <div className="flex items-center gap-3 mb-5">
          <div 
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${BRAND_GREEN}10` }}
          >
            <Sparkles className="h-5 w-5" style={{ color: BRAND_GREEN }} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">
              由 Suno V5 生成
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              为您创作了 2 个版本
            </p>
          </div>
        </div>

        {/* 🔥 高端双槽位布局 */}
        <div className="space-y-4">
          {/* 槽位 1 */}
          <SongSlotRenderer slot={songs[0]} version={1} />

          {/* 槽位 2 */}
          <SongSlotRenderer slot={songs[1]} version={2} />
        </div>
      </div>
    </div>
  )
}

// ============================================
// 单槽位渲染器 - 高端设计
// ============================================

function SongSlotRenderer({
  slot,
  version,
}: {
  slot: SongSlot
  version: number
}) {
  return (
    <AnimatePresence mode="wait">
      {/* 加载中 - 显示"音乐正在创作中" */}
      {slot.status === "loading" && (
        <motion.div
          key="loading"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          className="flex items-center gap-4 p-4 rounded-xl bg-slate-50/80 border border-slate-100"
        >
          {/* 🔥 封面占位 - 放大两倍 */}
          <div className="relative h-28 w-28 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center shrink-0 overflow-hidden">
            <Music className="h-10 w-10 text-slate-300" />
            {/* 脉冲动画 */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <span 
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ 
                  backgroundColor: `${BRAND_GREEN}10`,
                  color: BRAND_GREEN
                }}
              >
                版本 {version}
              </span>
            </div>
            
            {/* 🔥 音乐波形动画 */}
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-end gap-0.5 h-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1 rounded-full"
                    style={{ backgroundColor: BRAND_GREEN }}
                    animate={{ height: ["6px", "18px", "6px"] }}
                    transition={{
                      duration: 0.7,
                      repeat: Infinity,
                      delay: i * 0.12,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
            </div>
            
            {/* 🔥 显示"音乐正在创作中" */}
            <p className="text-sm font-medium" style={{ color: BRAND_GREEN }}>
              音乐正在创作中...
            </p>
            <p className="text-xs text-slate-400 mt-1">
              请耐心等待，约需 30-60 秒
            </p>
          </div>
        </motion.div>
      )}

      {/* 就绪 - 显示播放器 */}
      {slot.status === "ready" && slot.audioUrl && (
        <motion.div
          key="ready"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          <SingleTrackPlayer
            audioUrl={slot.audioUrl}
            coverUrl={slot.coverUrl}
            title={slot.title}
            version={version}
          />
        </motion.div>
      )}

      {/* 错误 */}
      {slot.status === "error" && (
        <motion.div
          key="error"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex items-center gap-4 p-4 rounded-xl bg-red-50/50 border border-red-100"
        >
          <div className="h-28 w-28 rounded-xl bg-red-100/50 flex items-center justify-center shrink-0">
            <AlertCircle className="h-10 w-10 text-red-400" />
          </div>
          <div className="flex-1">
            <span 
              className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-600"
            >
              版本 {version}
            </span>
            <p className="text-sm text-red-500 mt-2">{slot.errorMessage || "生成失败"}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ============================================
// 单曲播放器 - 高端简洁设计（网页内播放）
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
  const [isDownloading, setIsDownloading] = useState(false)

  const togglePlay = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const toggleMute = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (audioRef.current) {
      audioRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (audioRef.current && audioDuration > 0) {
      const rect = e.currentTarget.getBoundingClientRect()
      const percent = (e.clientX - rect.left) / rect.width
      audioRef.current.currentTime = percent * audioDuration
    }
  }

  // 🔥 下载到本地功能
  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (isDownloading) return
    
    setIsDownloading(true)
    toast.info("正在下载音乐...")
    
    try {
      const response = await fetch(audioUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `suno-v5-版本${version}.mp3`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success("下载成功！")
    } catch (err) {
      console.error("下载失败:", err)
      toast.error("下载失败，请重试")
    } finally {
      setIsDownloading(false)
    }
  }

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

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return "0:00"
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const progress = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      {/* 🔥 网页内播放 - 隐藏的 audio 元素 */}
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* 🔥 封面 + 播放按钮 - 放大两倍 */}
      <div className="relative shrink-0">
        <div className="h-28 w-28 rounded-xl overflow-hidden bg-gradient-to-br from-emerald-100 to-green-50 shadow-sm">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={`版本 ${version}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <Music className="h-10 w-10" style={{ color: BRAND_GREEN }} />
            </div>
          )}
        </div>
        
        {/* 播放按钮覆盖层 */}
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-xl opacity-0 hover:opacity-100 transition-opacity"
        >
          <div 
            className="h-12 w-12 rounded-full flex items-center justify-center text-white shadow-lg"
            style={{ backgroundColor: BRAND_GREEN }}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5 ml-0.5" />
            )}
          </div>
        </button>

        {/* 播放状态指示器 */}
        {isPlaying && (
          <div className="absolute -bottom-1 -right-1 flex items-end gap-0.5 p-1.5 bg-white rounded-lg shadow-sm">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1 rounded-full"
                style={{ backgroundColor: BRAND_GREEN }}
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

      {/* 播放器信息 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <span 
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ 
              backgroundColor: `${BRAND_GREEN}10`,
              color: BRAND_GREEN
            }}
          >
            版本 {version}
          </span>
          <span className="text-sm text-slate-500">
            {formatTime(currentTime)} / {formatTime(audioDuration)}
          </span>
        </div>

        {/* 进度条 */}
        <div
          className="relative h-2 bg-slate-100 rounded-full cursor-pointer group"
          onClick={handleProgressClick}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all"
            style={{ 
              width: `${progress}%`,
              backgroundColor: BRAND_GREEN 
            }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-md border-2 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ 
              left: `${progress}%`,
              borderColor: BRAND_GREEN,
              transform: `translateX(-50%) translateY(-50%)`
            }}
          />
        </div>
      </div>

      {/* 控制按钮 */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={toggleMute}
          className="p-2 rounded-lg hover:bg-slate-50 transition-colors"
        >
          {isMuted ? (
            <VolumeX className="h-5 w-5 text-slate-400" />
          ) : (
            <Volume2 className="h-5 w-5 text-slate-400" />
          )}
        </button>

        <button
          onClick={togglePlay}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white shadow-sm hover:opacity-90 transition-all"
          style={{ backgroundColor: BRAND_GREEN }}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 ml-0.5" />
          )}
        </button>

        {/* 🔥 下载按钮 - 使用 fetch + blob */}
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="p-2 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {isDownloading ? (
            <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
          ) : (
            <Download className="h-5 w-5 text-slate-400" />
          )}
        </button>
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
      className="flex flex-col items-center justify-center p-8 min-h-[180px]"
    >
      <div 
        className="flex h-12 w-12 items-center justify-center rounded-xl mb-4"
        style={{ backgroundColor: "#fef2f2" }}
      >
        <AlertCircle className="h-6 w-6 text-red-500" />
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
          style={{ backgroundColor: BRAND_GREEN }}
        >
          <RefreshCw className="h-4 w-4" />
          重新生成
        </button>
      )}
    </motion.div>
  )
}

export default MusicCard
