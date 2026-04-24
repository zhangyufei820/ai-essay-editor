'use client'

import { Loader2, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ImageModeOption, ImageSizeOption } from './types'

const BRAND_GREEN = '#14532d'

export interface ImageGenerationEntryProps {
  title: string
  prompt: string
  onPromptChange: (value: string) => void
  modes: ImageModeOption[]
  selectedModeKey: string
  onModeChange: (modeKey: string) => void
  sizeOptions: ImageSizeOption[]
  selectedSizeValue: string
  onSizeChange: (sizeValue: string) => void
  uploadedFileCount: number
  onUploadClick: () => void
  ctaLabel: string
  onSubmit: () => void
  isSubmitting: boolean
}

export function ImageGenerationEntry({
  title,
  prompt,
  onPromptChange,
  modes,
  selectedModeKey,
  onModeChange,
  sizeOptions,
  selectedSizeValue,
  onSizeChange,
  uploadedFileCount,
  onUploadClick,
  ctaLabel,
  onSubmit,
  isSubmitting,
}: ImageGenerationEntryProps) {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8 md:px-6 md:py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
            <p className="text-sm text-slate-500">用更简洁的方式开始你的图像创作</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {modes.map((mode) => (
              <button
                key={mode.key}
                type="button"
                onClick={() => onModeChange(mode.key)}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm transition-colors',
                  selectedModeKey === mode.key
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-600'
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {sizeOptions.map((size) => (
              <button
                key={size.value}
                type="button"
                onClick={() => onSizeChange(size.value)}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm transition-colors',
                  selectedSizeValue === size.value
                    ? 'border-green-800 bg-green-50 text-green-900'
                    : 'border-slate-200 bg-white text-slate-600'
                )}
              >
                {size.label}
              </button>
            ))}

            <button
              type="button"
              onClick={onUploadClick}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
            >
              <Paperclip className="h-4 w-4" />
              {uploadedFileCount > 0 ? `参考图 ${uploadedFileCount} 张` : '上传参考图'}
            </button>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
            <Textarea
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder="描述你想生成或编辑的画面..."
              className="min-h-[180px] resize-none border-0 bg-transparent px-3 py-3 text-base text-slate-800 placeholder:text-slate-400 focus-visible:ring-0"
            />

            <div className="mt-3 flex items-center justify-end">
              <Button
                type="button"
                onClick={onSubmit}
                disabled={isSubmitting || !prompt.trim()}
                className="rounded-full px-5 text-white"
                style={{ backgroundColor: BRAND_GREEN }}
              >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {ctaLabel}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
