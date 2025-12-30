/**
 * 🖼️ 沈翔学校 - 优化图片组件 (Optimized Image)
 * 
 * 基于 Next.js Image 的增强图片组件，支持：
 * - 自动懒加载
 * - 骨架屏占位
 * - 错误处理
 * - 模糊预览
 */

"use client"

import { useState, useCallback } from "react"
import Image, { ImageProps } from "next/image"
import { cn } from "@/lib/utils"

// ============================================
// 类型定义
// ============================================

interface OptimizedImageProps extends Omit<ImageProps, 'onError' | 'onLoad'> {
  /** 是否显示骨架屏 */
  showSkeleton?: boolean
  /** 骨架屏类名 */
  skeletonClassName?: string
  /** 错误时显示的备用图片 */
  fallbackSrc?: string
  /** 是否使用模糊预览 */
  blurPreview?: boolean
  /** 加载完成回调 */
  onLoadComplete?: () => void
  /** 错误回调 */
  onError?: () => void
  /** 容器类名 */
  containerClassName?: string
}

// ============================================
// 默认模糊占位符
// ============================================

const defaultBlurDataURL = 
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjFmNWY5Ii8+PC9zdmc+"

// ============================================
// 优化图片组件
// ============================================

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  className,
  showSkeleton = true,
  skeletonClassName,
  fallbackSrc = "/placeholder.svg",
  blurPreview = true,
  onLoadComplete,
  onError,
  containerClassName,
  priority = false,
  ...props
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  const handleLoad = useCallback(() => {
    setIsLoading(false)
    onLoadComplete?.()
  }, [onLoadComplete])

  const handleError = useCallback(() => {
    setIsLoading(false)
    setHasError(true)
    onError?.()
  }, [onError])

  // 确定最终的图片源
  const imageSrc = hasError ? fallbackSrc : src

  return (
    <div className={cn("relative overflow-hidden", containerClassName)}>
      {/* 骨架屏 */}
      {showSkeleton && isLoading && (
        <div 
          className={cn(
            "absolute inset-0 bg-slate-100 animate-pulse",
            skeletonClassName
          )}
        />
      )}

      {/* 图片 */}
      <Image
        src={imageSrc}
        alt={alt}
        width={width}
        height={height}
        className={cn(
          "transition-opacity duration-300",
          isLoading ? "opacity-0" : "opacity-100",
          className
        )}
        onLoad={handleLoad}
        onError={handleError}
        loading={priority ? undefined : "lazy"}
        priority={priority}
        placeholder={blurPreview ? "blur" : undefined}
        blurDataURL={blurPreview ? defaultBlurDataURL : undefined}
        {...props}
      />
    </div>
  )
}

// ============================================
// 头像组件
// ============================================

interface AvatarImageProps {
  src?: string | null
  alt?: string
  size?: number | "sm" | "md" | "lg" | "xl"
  className?: string
  fallback?: React.ReactNode
}

const sizeMap = {
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
}

export function AvatarImage({
  src,
  alt = "Avatar",
  size = "md",
  className,
  fallback
}: AvatarImageProps) {
  const [hasError, setHasError] = useState(false)
  const pixelSize = typeof size === "number" ? size : sizeMap[size]

  if (!src || hasError) {
    return (
      <div 
        className={cn(
          "flex items-center justify-center bg-slate-100 text-slate-400 rounded-full",
          className
        )}
        style={{ width: pixelSize, height: pixelSize }}
      >
        {fallback || (
          <span className="text-xs font-medium">
            {alt.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={pixelSize}
      height={pixelSize}
      className={cn("rounded-full object-cover", className)}
      onError={() => setHasError(true)}
    />
  )
}

// ============================================
// 背景图片组件
// ============================================

interface BackgroundImageProps {
  src: string
  alt?: string
  className?: string
  overlayClassName?: string
  children?: React.ReactNode
  priority?: boolean
}

export function BackgroundImage({
  src,
  alt = "Background",
  className,
  overlayClassName,
  children,
  priority = false
}: BackgroundImageProps) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        priority={priority}
        sizes="100vw"
      />
      {overlayClassName && (
        <div className={cn("absolute inset-0", overlayClassName)} />
      )}
      {children && (
        <div className="relative z-10">
          {children}
        </div>
      )}
    </div>
  )
}

// ============================================
// 默认导出
// ============================================

export default OptimizedImage
