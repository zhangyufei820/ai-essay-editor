'use client'

import type React from 'react'
import { Loader2, Paperclip, Send, X, FileText } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ImageModeOption, ImageSizeOption } from './types'

interface UploadedFilePreview {
  name: string
  preview?: string
}

interface ImageChatComposerProps {
  modeOptions: ImageModeOption[]
  selectedModeKey: string
  onModeChange: (modeKey: string) => void
  sizeOptions: ImageSizeOption[]
  selectedSizeValue: string
  onSizeChange: (sizeValue: string) => void
  input: string
  onInputChange: (value: string) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onSubmit: (event: React.FormEvent) => void
  onUploadClick: () => void
  uploadedFiles: UploadedFilePreview[]
  onRemoveFile: (index: number) => void
  isUploading: boolean
  uploadProgress: number
  isLoading: boolean
  submitLabelColor: string
  placeholder: string
}

export function ImageChatComposer(props: ImageChatComposerProps) {
  const selectedSize =
    props.sizeOptions.find((size) => size.value === props.selectedSizeValue) ?? props.sizeOptions[0]
  const ratioOptions = Array.from(new Set(props.sizeOptions.map((size) => size.ratio)))
  const resolutionOptions = Array.from(
    new Map(props.sizeOptions.map((size) => [size.tier, size.tierLabel])).entries()
  ).map(([value, label]) => ({ value, label }))

  const handleRatioChange = (ratio: string) => {
    const nextSize =
      props.sizeOptions.find((size) => size.ratio === ratio && size.tier === selectedSize.tier) ??
      props.sizeOptions.find((size) => size.ratio === ratio) ??
      props.sizeOptions[0]

    props.onSizeChange(nextSize.value)
  }

  const handleResolutionChange = (tier: string) => {
    const nextSize =
      props.sizeOptions.find((size) => size.ratio === selectedSize.ratio && size.tier === tier) ??
      props.sizeOptions.find((size) => size.tier === tier) ??
      props.sizeOptions[0]

    props.onSizeChange(nextSize.value)
  }

  return (
    <>
      {props.isUploading ? (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">上传中...</span>
            <span className="text-xs font-medium" style={{ color: props.submitLabelColor }}>{props.uploadProgress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: props.submitLabelColor }}
              initial={{ width: 0 }}
              animate={{ width: `${props.uploadProgress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      ) : null}

      {props.uploadedFiles.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {props.uploadedFiles.map((file, index) => (
            <div key={`${file.name}-${index}`} className="relative group">
              {file.preview ? (
                <div className="relative h-20 w-20 overflow-hidden rounded-lg border-2 border-slate-200">
                  <img src={file.preview} alt={file.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => props.onRemoveFile(index)}
                    className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <FileText className="h-4 w-4 text-green-600" />
                  <span className="max-w-[100px] truncate text-slate-600">{file.name}</span>
                  <button type="button" onClick={() => props.onRemoveFile(index)} className="text-slate-400 hover:text-red-500">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <form onSubmit={props.onSubmit} className="relative rounded-[24px] border border-slate-200 bg-white shadow-lg">
        <div className="border-b border-slate-100 px-3 pb-2 pt-3">
          <div className="flex flex-wrap items-center gap-3">
            {props.modeOptions.length > 1 ? (
              <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
                {props.modeOptions.map((mode) => (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => props.onModeChange(mode.key)}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200',
                      props.selectedModeKey === mode.key
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    )}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
              {ratioOptions.map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => handleRatioChange(ratio)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200',
                    selectedSize.ratio === ratio
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  {ratio}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
              {resolutionOptions.map((resolution) => (
                <button
                  key={resolution.value}
                  type="button"
                  onClick={() => handleResolutionChange(resolution.value)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200',
                    selectedSize.tier === resolution.value
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  {resolution.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-end gap-2 p-3">
          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-slate-400 hover:bg-slate-50" onClick={props.onUploadClick} disabled={props.isLoading}>
            <Paperclip className="h-5 w-5" />
          </Button>

          <Textarea
            value={props.input}
            onChange={(event) => props.onInputChange(event.target.value)}
            onKeyDown={props.onKeyDown}
            placeholder={props.placeholder}
            className="min-h-[48px] max-h-[160px] flex-1 resize-none border-0 bg-transparent p-2 text-[15px] text-slate-700 placeholder:text-slate-400 focus-visible:ring-0"
            disabled={props.isLoading}
            rows={1}
          />

          <Button
            type="submit"
            size="icon"
            className="h-10 w-10 rounded-xl text-white shadow-lg transition-all hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: props.submitLabelColor }}
            disabled={props.isLoading || !props.input.trim()}
          >
            {props.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </div>
      </form>
    </>
  )
}
