/**
 * 🎵 MusicCard 组件 - Suno 音乐生成卡片 V2
 * 
 * 🔥 全新设计：
 * 1. 大封面 + 下方播放按钮
 * 2. 右侧歌词滚动显示（高亮当前行）
 * 3. 底部音频波形进度条（跳动音符效果）
 * 4. 界面更高端大气
 */

"use client"

import React, { useState, useRef, useEffect, useMemo } from "react"
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
  Loader2,
  SkipBack,
  SkipForward
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

/** 歌词行 */
interface LyricLine {
  time: number  // 秒
  text: string
}

// ============================================
// 歌词解析工具
// ============================================

/** 解析 LRC 格式歌词 */
function parseLyrics(lyricsText: string): LyricLine[] {
  if (!lyricsText) return []
  
  const lines: LyricLine[] = []
  const lrcRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/g
  
  // 尝试 LRC 格式
  let match
  while ((match = lrcRegex.exec(lyricsText)) !== null) {
    const minutes = parseInt(match[1], 10)
    const seconds = parseInt(match[2], 10)
    const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0
    const time = minutes * 60 + seconds + milliseconds / 1000
    const text = match[4].trim()
    if (text) {
      lines.push({ time, text })
    }
  }
  
  // 如果没有时间戳，按行分割（普通歌词）
  if (lines.length === 0) {
    const plainLines = lyricsText.split('\n').filter(l => l.trim())
    // 每行假设 4 秒
    plainLines.forEach((text, index) => {
      // 跳过标签行（如 [Verse 1]、[Chorus] 等）
      const trimmedText = text.trim()
      if (trimmedText && !trimmedText.match(/^\[.*\]$/)) {
        lines.push({ time: index * 4, text: trimmedText })
      }
    })
  }
  
  return lines.sort((a, b) => a.time - b.time)
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
        {/* 🔥 简洁标题 */}
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
        <div className="space-y-6">
          <SongSlotRenderer slot={songs[0]} version={1} />
          <SongSlotRenderer slot={songs[1]} version={2} />
        </div>
      </div>
    </div>
  )
}

// ============================================
// 单槽位渲染器
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
      {/* 加载中 */}
      {slot.status === "loading" && (
        <motion.div
          key="loading"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          className="rounded-2xl bg-slate-50/80 border border-slate-100 p-6"
        >
          <LoadingState version={version} />
        </motion.div>
      )}

      {/* 就绪 - 显示新版播放器 */}
      {slot.status === "ready" && slot.audioUrl && (
        <motion.div
          key="ready"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          <PremiumMusicPlayer
            audioUrl={slot.audioUrl}
            coverUrl={slot.coverUrl}
            title={slot.title}
            lyrics={slot.lyrics}
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
          className="flex items-center gap-4 p-6 rounded-2xl bg-red-50/50 border border-red-100"
        >
          <div className="h-20 w-20 rounded-xl bg-red-100/50 flex items-center justify-center shrink-0">
            <AlertCircle className="h-8 w-8 text-red-400" />
          </div>
          <div className="flex-1">
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-600">
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
// 加载状态组件
// ============================================

function LoadingState({ version }: { version: number }) {
  return (
    <div className="flex items-center gap-6">
      {/* 封面占位 */}
      <div className="relative h-32 w-32 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center shrink-0 overflow-hidden">
        <Music className="h-12 w-12 text-slate-300" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-4">
          <span 
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${BRAND_GREEN}10`, color: BRAND_GREEN }}
          >
            版本 {version}
          </span>
        </div>
        
        {/* 音乐波形动画 */}
        <div className="flex items-end gap-1 h-8 mb-3">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 rounded-full"
              style={{ backgroundColor: BRAND_GREEN }}
              animate={{ height: ["8px", "24px", "8px"] }}
              transition={{
                duration: 0.7,
                repeat: Infinity,
                delay: i * 0.1,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
        
        <p className="text-sm font-medium" style={{ color: BRAND_GREEN }}>
          音乐正在创作中...
        </p>
        <p className="text-xs text-slate-400 mt-1">
          请耐心等待，约需 30-60 秒
        </p>
      </div>
    </div>
  )
}

// ============================================
// 🔥 全新高端音乐播放器
// ============================================

interface PremiumMusicPlayerProps {
  audioUrl: string
  coverUrl?: string
  title?: string
  lyrics?: string
  version: number
}

function PremiumMusicPlayer({
  audioUrl,
  coverUrl,
  title,
  lyrics,
  version,
}: PremiumMusicPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const lyricsContainerRef = useRef<HTMLDivElement>(null)
  
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [isDownloading, setIsDownloading] = useState(false)
  
  // 解析歌词
  const parsedLyrics = useMemo(() => parseLyrics(lyrics || ''), [lyrics])
  
  // 当前歌词行索引
  const currentLyricIndex = useMemo(() => {
    if (parsedLyrics.length === 0) return -1
    for (let i = parsedLyrics.length - 1; i >= 0; i--) {
      if (currentTime >= parsedLyrics[i].time) {
        return i
      }
    }
    return -1
  }, [currentTime, parsedLyrics])

  // 滚动歌词到当前行
  useEffect(() => {
    if (currentLyricIndex >= 0 && lyricsContainerRef.current) {
      const container = lyricsContainerRef.current
      const activeLine = container.querySelector(`[data-index="${currentLyricIndex}"]`)
      if (activeLine) {
        activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [currentLyricIndex])

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

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const seekTo = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
    }
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (audioRef.current && audioDuration > 0) {
      const rect = e.currentTarget.getBoundingClientRect()
      const percent = (e.clientX - rect.left) / rect.width
      seekTo(percent * audioDuration)
    }
  }

  const handleDownload = async () => {
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
    <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden shadow-xl">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      
      {/* 🔥 主体布局：左封面 + 右歌词 */}
      <div className="flex min-h-[280px]">
        {/* 左侧：封面 + 播放控制 */}
        <div className="w-[240px] p-5 flex flex-col items-center justify-center shrink-0 border-r border-slate-700/50">
          {/* 版本标签 */}
          <div className="mb-3">
            <span 
              className="text-xs font-medium px-3 py-1 rounded-full"
              style={{ backgroundColor: BRAND_GREEN, color: 'white' }}
            >
              版本 {version}
            </span>
          </div>
          
          {/* 🔥 大封面 */}
          <div className="relative w-40 h-40 rounded-xl overflow-hidden shadow-2xl mb-4">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={title || `版本 ${version}`}
                className={cn(
                  "w-full h-full object-cover transition-transform duration-1000",
                  isPlaying && "animate-spin-slow"
                )}
                style={{ animationDuration: '8s' }}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-emerald-600 to-green-800 flex items-center justify-center">
                <Music className="h-16 w-16 text-white/60" />
              </div>
            )}
            
            {/* 播放状态光晕 */}
            {isPlaying && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            )}
          </div>
          
          {/* 🔥 播放按钮（在封面下方） */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => seekTo(Math.max(0, currentTime - 10))}
              className="p-2 rounded-full bg-slate-700/50 hover:bg-slate-600/50 transition-colors"
            >
              <SkipBack className="h-4 w-4 text-white" />
            </button>
            
            <button
              onClick={togglePlay}
              className="flex h-14 w-14 items-center justify-center rounded-full shadow-lg hover:scale-105 transition-transform"
              style={{ backgroundColor: BRAND_GREEN }}
            >
              {isPlaying ? (
                <Pause className="h-6 w-6 text-white" />
              ) : (
                <Play className="h-6 w-6 text-white ml-1" />
              )}
            </button>
            
            <button
              onClick={() => seekTo(Math.min(audioDuration, currentTime + 10))}
              className="p-2 rounded-full bg-slate-700/50 hover:bg-slate-600/50 transition-colors"
            >
              <SkipForward className="h-4 w-4 text-white" />
            </button>
          </div>
          
          {/* 音量 + 下载 */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={toggleMute}
              className="p-2 rounded-full hover:bg-slate-700/50 transition-colors"
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4 text-slate-400" />
              ) : (
                <Volume2 className="h-4 w-4 text-slate-400" />
              )}
            </button>
            
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="p-2 rounded-full hover:bg-slate-700/50 transition-colors disabled:opacity-50"
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
              ) : (
                <Download className="h-4 w-4 text-slate-400" />
              )}
            </button>
          </div>
        </div>
        
        {/* 🔥 右侧：歌词显示区域 */}
        <div className="flex-1 flex flex-col">
          {/* 歌词滚动区域 */}
          <div 
            ref={lyricsContainerRef}
            className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
            style={{ maxHeight: '220px' }}
          >
            {parsedLyrics.length > 0 ? (
              <div className="space-y-3 py-10">
                {parsedLyrics.map((line, index) => (
                  <motion.div
                    key={index}
                    data-index={index}
                    onClick={() => seekTo(line.time)}
                    className={cn(
                      "text-center cursor-pointer transition-all duration-300 px-4 py-1 rounded-lg",
                      index === currentLyricIndex
                        ? "text-white text-lg font-medium scale-105"
                        : "text-slate-500 text-sm hover:text-slate-300"
                    )}
                    style={{
                      color: index === currentLyricIndex ? BRAND_GREEN : undefined,
                      textShadow: index === currentLyricIndex ? '0 0 20px rgba(20,83,45,0.5)' : undefined
                    }}
                  >
                    {line.text}
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <Music className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">暂无歌词</p>
                  <p className="text-slate-600 text-xs mt-1">享受纯音乐体验</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* 🔥 底部：音频波形进度条 */}
      <div className="px-5 pb-4">
        {/* 时间显示 */}
        <div className="flex justify-between text-xs text-slate-500 mb-2">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(audioDuration)}</span>
        </div>
        
        {/* 🔥 音符波浪进度条 */}
        <div 
          className="relative h-12 cursor-pointer group"
          onClick={handleProgressClick}
        >
          {/* 背景波形 */}
          <div className="absolute inset-0 flex items-end justify-around gap-0.5">
            {Array.from({ length: 50 }).map((_, i) => {
              const barProgress = (i / 50) * 100
              const isActive = barProgress <= progress
              const height = Math.sin((i / 50) * Math.PI * 4) * 0.5 + 0.5 // 波浪效果
              
              return (
                <motion.div
                  key={i}
                  className="flex-1 rounded-t-sm transition-colors"
                  style={{
                    height: `${20 + height * 70}%`,
                    backgroundColor: isActive ? BRAND_GREEN : 'rgb(71, 85, 105)',
                    opacity: isActive ? 1 : 0.3
                  }}
                  animate={isPlaying && isActive ? {
                    height: [`${20 + height * 70}%`, `${30 + height * 60}%`, `${20 + height * 70}%`]
                  } : {}}
                  transition={{
                    duration: 0.4,
                    repeat: Infinity,
                    delay: i * 0.02,
                    ease: "easeInOut"
                  }}
                />
              )
            })}
          </div>
          
          {/* 进度指示器 */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg transition-all"
            style={{ left: `${progress}%` }}
          />
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
