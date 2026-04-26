# GPT Image 2 / Banana Image UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the GPT Image 2 image-generation entry page and fullscreen chat UI with a large-model-style design, then reuse the same UI code for Banana without changing backend behavior.

**Architecture:** Split the image experience into a reusable “entry workspace” and a reusable “image chat composer” layer. First adapt GPT Image 2 to the new structure, then connect Banana to the same shared UI components while preserving each model’s existing request payload and response parsing.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Framer Motion, Supabase, Jest

---

## File Map

### Existing files to modify
- `components/chat/gpt-image2-chat-interface.tsx` — current GPT Image 2 fullscreen chat UI; will be slimmed down to compose shared image-chat UI pieces
- `components/chat/banana-chat-interface.tsx` — current Banana fullscreen chat UI; will be slimmed down to compose the same shared image-chat UI pieces
- `app/chat/creative-image-gpt2/page.tsx` — currently points directly to GPT Image 2 chat; will become the GPT Image 2 entry workspace route
- `app/chat/creative-image-banana/page.tsx` — currently points directly to Banana chat; will become the Banana entry workspace route
- `components/chat/CreativePanel.tsx` — creative-zone links already point at the `creative-image-*` routes; verify they continue to land on the new entry pages

### New files to create
- `components/chat/image-generation/types.ts` — shared types for image mode, size option, uploaded file, message, and model config
- `components/chat/image-generation/config.ts` — shared model-specific UI config for GPT Image 2 and Banana (title, model key, labels, size options, route targets)
- `components/chat/image-generation/image-generation-entry.tsx` — reusable entry workspace with hero, mode/size buttons, upload area, prompt box, and CTA
- `components/chat/image-generation/image-chat-composer.tsx` — reusable bottom composer with parameter pills, upload button, preview strip, textarea, and send button
- `components/chat/image-generation/image-chat-shell.tsx` — reusable shell for top bar, scroll area, empty state, new-message button, composer, and history sidebar frame
- `app/chat/gpt-image-2/page.tsx` — dedicated fullscreen chat route for GPT Image 2 after the user clicks generate/edit
- `__tests__/image-generation-config.test.ts` — validates shared model config and size mappings
- `__tests__/image-generation-routing.test.ts` — validates route targets and entry-to-chat navigation helper behavior at pure-function level

### Optional small extraction during implementation
If the worker sees repeated pure helper logic while editing:
- `components/chat/image-generation/navigation.ts` — pure route helper functions only if needed to keep page files small

---

## Task 1: Create shared image-generation types and config

**Files:**
- Create: `components/chat/image-generation/types.ts`
- Create: `components/chat/image-generation/config.ts`
- Test: `__tests__/image-generation-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import {
  getImageModelConfig,
  GPT_IMAGE_2_CHAT_ROUTE,
  BANANA_CHAT_ROUTE,
} from '@/components/chat/image-generation/config'

describe('image generation config', () => {
  it('returns GPT Image 2 config with text-image and image-edit modes', () => {
    const config = getImageModelConfig('gpt-image-2')

    expect(config.entryRoute).toBe('/chat/creative-image-gpt2')
    expect(config.chatRoute).toBe(GPT_IMAGE_2_CHAT_ROUTE)
    expect(config.modes.map((mode) => mode.key)).toEqual(['text-to-image', 'image-edit'])
    expect(config.sizeOptions.map((size) => size.value)).toEqual(['1:1', '9:16', '4:3'])
  })

  it('returns Banana config with image mode and fixed size choices', () => {
    const config = getImageModelConfig('banana-2-pro')

    expect(config.entryRoute).toBe('/chat/creative-image-banana')
    expect(config.chatRoute).toBe(BANANA_CHAT_ROUTE)
    expect(config.modes.map((mode) => mode.key)).toEqual(['image'])
    expect(config.sizeOptions.map((size) => size.value)).toEqual(['16:9', '9:16', '1:1', '3:4', '4:3'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runTestsByPath __tests__/image-generation-config.test.ts`
Expected: FAIL with module not found for `@/components/chat/image-generation/config`

- [ ] **Step 3: Write minimal implementation**

`components/chat/image-generation/types.ts`
```ts
export type ImageGenerationModel = 'gpt-image-2' | 'banana-2-pro'

export type ImageModeKey = 'text-to-image' | 'image-edit' | 'image'

export interface ImageModeOption {
  key: ImageModeKey
  label: string
}

export interface ImageSizeOption {
  label: string
  value: string
  width: number
  height: number
}

export interface ImageModelConfig {
  model: ImageGenerationModel
  title: string
  modelKey: 'gpt-image-2' | 'banana-2-pro'
  entryRoute: string
  chatRoute: string
  defaultPromptPlaceholder: string
  ctaLabel: string
  modes: ImageModeOption[]
  sizeOptions: ImageSizeOption[]
  defaultSizeValue: string
  defaultModeKey: ImageModeKey
}
```

`components/chat/image-generation/config.ts`
```ts
import type { ImageGenerationModel, ImageModelConfig } from './types'

export const GPT_IMAGE_2_CHAT_ROUTE = '/chat/gpt-image-2'
export const BANANA_CHAT_ROUTE = '/chat/banana-2-pro'

const MODEL_CONFIGS: Record<ImageGenerationModel, ImageModelConfig> = {
  'gpt-image-2': {
    model: 'gpt-image-2',
    title: 'GPT Image 2',
    modelKey: 'gpt-image-2',
    entryRoute: '/chat/creative-image-gpt2',
    chatRoute: GPT_IMAGE_2_CHAT_ROUTE,
    defaultPromptPlaceholder: '描述你想生成或编辑的画面...',
    ctaLabel: '开始生成',
    modes: [
      { key: 'text-to-image', label: '文生图' },
      { key: 'image-edit', label: '图像编辑' },
    ],
    sizeOptions: [
      { label: '1:1', value: '1:1', width: 1024, height: 1024 },
      { label: '9:16', value: '9:16', width: 1024, height: 1536 },
      { label: '4:3', value: '4:3', width: 1536, height: 1024 },
    ],
    defaultSizeValue: '1:1',
    defaultModeKey: 'text-to-image',
  },
  'banana-2-pro': {
    model: 'banana-2-pro',
    title: 'Banana2 Pro 4K',
    modelKey: 'banana-2-pro',
    entryRoute: '/chat/creative-image-banana',
    chatRoute: BANANA_CHAT_ROUTE,
    defaultPromptPlaceholder: '描述你想生成的图片...',
    ctaLabel: '开始生成',
    modes: [{ key: 'image', label: '图像生成' }],
    sizeOptions: [
      { label: '16:9', value: '16:9', width: 1920, height: 1080 },
      { label: '9:16', value: '9:16', width: 1080, height: 1920 },
      { label: '1:1', value: '1:1', width: 1024, height: 1024 },
      { label: '3:4', value: '3:4', width: 768, height: 1024 },
      { label: '4:3', value: '4:3', width: 1024, height: 768 },
    ],
    defaultSizeValue: '9:16',
    defaultModeKey: 'image',
  },
}

export function getImageModelConfig(model: ImageGenerationModel): ImageModelConfig {
  return MODEL_CONFIGS[model]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runTestsByPath __tests__/image-generation-config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add __tests__/image-generation-config.test.ts components/chat/image-generation/types.ts components/chat/image-generation/config.ts
git commit -m "feat: add shared image generation config"
```

---

## Task 2: Add pure routing helpers for entry → fullscreen chat navigation

**Files:**
- Create: `components/chat/image-generation/navigation.ts`
- Test: `__tests__/image-generation-routing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { buildImageChatRoute } from '@/components/chat/image-generation/navigation'

describe('buildImageChatRoute', () => {
  it('builds GPT Image 2 fullscreen chat route with prompt and size', () => {
    expect(
      buildImageChatRoute('/chat/gpt-image-2', {
        prompt: '海边日落',
        mode: 'image-edit',
        size: '1:1',
        fileCount: 2,
      })
    ).toBe('/chat/gpt-image-2?prompt=%E6%B5%B7%E8%BE%B9%E6%97%A5%E8%90%BD&mode=image-edit&size=1%3A1&files=2')
  })

  it('omits empty values from the query string', () => {
    expect(
      buildImageChatRoute('/chat/banana-2-pro', {
        prompt: '',
        mode: 'image',
        size: '9:16',
        fileCount: 0,
      })
    ).toBe('/chat/banana-2-pro?mode=image&size=9%3A16')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runTestsByPath __tests__/image-generation-routing.test.ts`
Expected: FAIL with module not found for `@/components/chat/image-generation/navigation`

- [ ] **Step 3: Write minimal implementation**

`components/chat/image-generation/navigation.ts`
```ts
interface BuildImageChatRouteParams {
  prompt: string
  mode: string
  size: string
  fileCount: number
}

export function buildImageChatRoute(baseRoute: string, params: BuildImageChatRouteParams): string {
  const searchParams = new URLSearchParams()

  if (params.prompt.trim()) {
    searchParams.set('prompt', params.prompt.trim())
  }

  if (params.mode) {
    searchParams.set('mode', params.mode)
  }

  if (params.size) {
    searchParams.set('size', params.size)
  }

  if (params.fileCount > 0) {
    searchParams.set('files', String(params.fileCount))
  }

  const query = searchParams.toString()
  return query ? `${baseRoute}?${query}` : baseRoute
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runTestsByPath __tests__/image-generation-routing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add __tests__/image-generation-routing.test.ts components/chat/image-generation/navigation.ts
git commit -m "test: add image route builder coverage"
```

---

## Task 3: Build the shared entry workspace component

**Files:**
- Create: `components/chat/image-generation/image-generation-entry.tsx`
- Modify: `app/chat/creative-image-gpt2/page.tsx`
- Test: none in Jest for this task because the repo is configured for Node-only Jest; validate via browser in later tasks

- [ ] **Step 1: Create the reusable props contract**

`components/chat/image-generation/image-generation-entry.tsx`
```ts
import type { ImageModeOption, ImageSizeOption } from './types'

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
```

- [ ] **Step 2: Implement the minimal reusable entry layout**

`components/chat/image-generation/image-generation-entry.tsx`
```tsx
import { Loader2, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ImageGenerationEntryProps } from './image-generation-entry'

const BRAND_GREEN = '#14532d'

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
```

- [ ] **Step 3: Wire GPT Image 2 entry page to the shared entry component**

`app/chat/creative-image-gpt2/page.tsx`
```tsx
'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getImageModelConfig } from '@/components/chat/image-generation/config'
import { ImageGenerationEntry } from '@/components/chat/image-generation/image-generation-entry'
import { buildImageChatRoute } from '@/components/chat/image-generation/navigation'

export default function CreativeImageGpt2Page() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const config = useMemo(() => getImageModelConfig('gpt-image-2'), [])
  const [prompt, setPrompt] = useState('')
  const [selectedModeKey, setSelectedModeKey] = useState(config.defaultModeKey)
  const [selectedSizeValue, setSelectedSizeValue] = useState(config.defaultSizeValue)
  const [uploadedFileCount, setUploadedFileCount] = useState(0)

  return (
    <>
      <ImageGenerationEntry
        title={config.title}
        prompt={prompt}
        onPromptChange={setPrompt}
        modes={config.modes}
        selectedModeKey={selectedModeKey}
        onModeChange={setSelectedModeKey}
        sizeOptions={config.sizeOptions}
        selectedSizeValue={selectedSizeValue}
        onSizeChange={setSelectedSizeValue}
        uploadedFileCount={uploadedFileCount}
        onUploadClick={() => fileInputRef.current?.click()}
        ctaLabel={selectedModeKey === 'image-edit' ? '开始编辑' : config.ctaLabel}
        onSubmit={() => {
          router.push(
            buildImageChatRoute(config.chatRoute, {
              prompt,
              mode: selectedModeKey,
              size: selectedSizeValue,
              fileCount: uploadedFileCount,
            })
          )
        }}
        isSubmitting={false}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => setUploadedFileCount(event.target.files?.length ?? 0)}
      />
    </>
  )
}
```

- [ ] **Step 4: Run the app and verify the new GPT Image 2 entry page renders**

Run: `npm run dev`
Then open: `http://localhost:3000/chat/creative-image-gpt2`
Expected: centered entry workspace with mode buttons, size buttons, upload button, large textarea, and CTA

- [ ] **Step 5: Commit**

```bash
git add components/chat/image-generation/image-generation-entry.tsx app/chat/creative-image-gpt2/page.tsx
git commit -m "feat: add GPT Image 2 entry workspace"
```

---

## Task 4: Add URL-seeded state to GPT Image 2 fullscreen chat

**Files:**
- Modify: `components/chat/gpt-image2-chat-interface.tsx`
- Test: manual browser verification

- [ ] **Step 1: Read prompt/mode/size from `useSearchParams` at initialization**

Add this state initialization pattern near existing `useSearchParams` usage:

```ts
const initialPrompt = searchParams.get('prompt') ?? ''
const initialMode = searchParams.get('mode') ?? 'text-to-image'
const initialSizeValue = searchParams.get('size') ?? '1:1'
```

- [ ] **Step 2: Use those URL values as initial state instead of hardcoded defaults**

Replace current defaults:

```ts
const [input, setInput] = useState(initialPrompt)
const [selectedMode, setSelectedMode] = useState<ModeOption>(
  MODE_OPTIONS.find((mode) => mode.key === initialMode) ?? MODE_OPTIONS[0]
)
const [selectedSize, setSelectedSize] = useState<SizeOption>(
  SIZE_OPTIONS.find((size) => size.value === initialSizeValue) ?? SIZE_OPTIONS[0]
)
```

- [ ] **Step 3: Auto-submit once on first load when prompt exists**

Add a guarded effect:

```ts
const hasAutoSubmittedRef = useRef(false)

useEffect(() => {
  if (!userId || !input.trim() || hasAutoSubmittedRef.current) {
    return
  }

  hasAutoSubmittedRef.current = true
  void onSubmit({ preventDefault() {} } as React.FormEvent)
}, [userId, input])
```

- [ ] **Step 4: Run the app and verify entry → chat handoff**

Run: `npm run dev`
Flow:
1. Open `http://localhost:3000/chat/creative-image-gpt2`
2. Pick `图像编辑`
3. Pick `4:3`
4. Enter `把这张图改成电影海报风格`
5. Click CTA
Expected:
- route changes to `/chat/gpt-image-2?...`
- fullscreen chat opens immediately
- composer pills keep the chosen mode and size
- first request sends automatically

- [ ] **Step 5: Commit**

```bash
git add components/chat/gpt-image2-chat-interface.tsx
git commit -m "feat: seed GPT Image 2 chat from entry state"
```

---

## Task 5: Create the dedicated GPT Image 2 fullscreen chat route

**Files:**
- Create: `app/chat/gpt-image-2/page.tsx`

- [ ] **Step 1: Create the dedicated fullscreen page**

`app/chat/gpt-image-2/page.tsx`
```tsx
import type { Metadata } from 'next'
import { GptImage2ChatInterface } from '@/components/chat/gpt-image2-chat-interface'

export const metadata: Metadata = {
  title: 'GPT Image 2 | 沈翔智学',
  description: 'AI 图像生成 - GPT Image 2 全屏对话',
}

export default function GptImage2Page() {
  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex-1">
        <GptImage2ChatInterface />
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Run the app and verify the new route loads the existing chat UI**

Run: `npm run dev`
Open: `http://localhost:3000/chat/gpt-image-2`
Expected: existing GPT Image 2 fullscreen chat interface still works

- [ ] **Step 3: Commit**

```bash
git add app/chat/gpt-image-2/page.tsx
git commit -m "feat: add GPT Image 2 fullscreen chat route"
```

---

## Task 6: Extract the shared bottom composer

**Files:**
- Create: `components/chat/image-generation/image-chat-composer.tsx`
- Modify: `components/chat/gpt-image2-chat-interface.tsx`
- Modify: `components/chat/banana-chat-interface.tsx`
- Test: manual browser verification

- [ ] **Step 1: Create the reusable composer component**

`components/chat/image-generation/image-chat-composer.tsx`
```tsx
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
              {props.sizeOptions.map((size) => (
                <button
                  key={size.value}
                  type="button"
                  onClick={() => props.onSizeChange(size.value)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200',
                    props.selectedSizeValue === size.value
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  {size.label}
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
```

- [ ] **Step 2: Replace the GPT Image 2 composer JSX with the shared component**

Replace the block starting at the upload progress area and ending at the closing `</form>` with:

```tsx
<ImageChatComposer
  modeOptions={MODE_OPTIONS}
  selectedModeKey={selectedMode.key}
  onModeChange={(modeKey) => setSelectedMode(MODE_OPTIONS.find((mode) => mode.key === modeKey) ?? MODE_OPTIONS[0])}
  sizeOptions={SIZE_OPTIONS}
  selectedSizeValue={selectedSize.value}
  onSizeChange={(sizeValue) => setSelectedSize(SIZE_OPTIONS.find((size) => size.value === sizeValue) ?? SIZE_OPTIONS[0])}
  input={input}
  onInputChange={setInput}
  onKeyDown={handleKeyDown}
  onSubmit={onSubmit}
  onUploadClick={() => {
    if (!userId) {
      toast.error('请先登录后再上传文件')
      return
    }
    fileInputRef.current?.click()
  }}
  uploadedFiles={uploadedFiles}
  onRemoveFile={removeFile}
  isUploading={isUploading}
  uploadProgress={uploadProgress}
  isLoading={isLoading}
  submitLabelColor={BRAND_GREEN}
  placeholder={userId ? '继续描述你的图像需求...' : '请先登录...'}
/>
```

- [ ] **Step 3: Replace the Banana composer JSX with the same shared component**

Replace the equivalent block with:

```tsx
<ImageChatComposer
  modeOptions={[{ key: 'image', label: '图像生成' }]}
  selectedModeKey="image"
  onModeChange={() => undefined}
  sizeOptions={SIZE_OPTIONS}
  selectedSizeValue={selectedSize.value}
  onSizeChange={(sizeValue) => setSelectedSize(SIZE_OPTIONS.find((size) => size.value === sizeValue) ?? SIZE_OPTIONS[1])}
  input={input}
  onInputChange={setInput}
  onKeyDown={handleKeyDown}
  onSubmit={onSubmit}
  onUploadClick={() => {
    if (!userId) {
      toast.error('请先登录后再上传文件')
      return
    }
    fileInputRef.current?.click()
  }}
  uploadedFiles={uploadedFiles}
  onRemoveFile={removeFile}
  isUploading={isUploading}
  uploadProgress={uploadProgress}
  isLoading={isLoading}
  submitLabelColor={BANANA_COLOR}
  placeholder={userId ? '继续描述你的图像需求...' : '请先登录...'}
/>
```

- [ ] **Step 4: Run the app and verify both composers stay functional**

Run: `npm run dev`
Verify:
- `http://localhost:3000/chat/gpt-image-2`
- `http://localhost:3000/chat/banana-2-pro`
Expected:
- both pages show the new unified parameter bar above the textarea
- upload preview still works
- submitting still sends requests with correct model-specific payloads

- [ ] **Step 5: Commit**

```bash
git add components/chat/image-generation/image-chat-composer.tsx components/chat/gpt-image2-chat-interface.tsx components/chat/banana-chat-interface.tsx
git commit -m "refactor: share image chat composer across image models"
```

---

## Task 7: Rebuild the Banana entry page with the same shared workspace

**Files:**
- Modify: `app/chat/creative-image-banana/page.tsx`
- Test: manual browser verification

- [ ] **Step 1: Replace the Banana creative route with the shared entry workspace**

`app/chat/creative-image-banana/page.tsx`
```tsx
'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getImageModelConfig } from '@/components/chat/image-generation/config'
import { ImageGenerationEntry } from '@/components/chat/image-generation/image-generation-entry'
import { buildImageChatRoute } from '@/components/chat/image-generation/navigation'

export default function CreativeImageBananaPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const config = useMemo(() => getImageModelConfig('banana-2-pro'), [])
  const [prompt, setPrompt] = useState('')
  const [selectedModeKey] = useState(config.defaultModeKey)
  const [selectedSizeValue, setSelectedSizeValue] = useState(config.defaultSizeValue)
  const [uploadedFileCount, setUploadedFileCount] = useState(0)

  return (
    <>
      <ImageGenerationEntry
        title={config.title}
        prompt={prompt}
        onPromptChange={setPrompt}
        modes={config.modes}
        selectedModeKey={selectedModeKey}
        onModeChange={() => undefined}
        sizeOptions={config.sizeOptions}
        selectedSizeValue={selectedSizeValue}
        onSizeChange={setSelectedSizeValue}
        uploadedFileCount={uploadedFileCount}
        onUploadClick={() => fileInputRef.current?.click()}
        ctaLabel={config.ctaLabel}
        onSubmit={() => {
          router.push(
            buildImageChatRoute(config.chatRoute, {
              prompt,
              mode: selectedModeKey,
              size: selectedSizeValue,
              fileCount: uploadedFileCount,
            })
          )
        }}
        isSubmitting={false}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => setUploadedFileCount(event.target.files?.length ?? 0)}
      />
    </>
  )
}
```

- [ ] **Step 2: Run the app and verify Banana now starts from the same style of entry page**

Run: `npm run dev`
Open: `http://localhost:3000/chat/creative-image-banana`
Expected: same high-level UI structure as GPT Image 2 entry page, with Banana title and Banana size options

- [ ] **Step 3: Commit**

```bash
git add app/chat/creative-image-banana/page.tsx
git commit -m "feat: reuse image entry workspace for banana"
```

---

## Task 8: Polish the shared fullscreen shell and align top-level visuals

**Files:**
- Create: `components/chat/image-generation/image-chat-shell.tsx`
- Modify: `components/chat/gpt-image2-chat-interface.tsx`
- Modify: `components/chat/banana-chat-interface.tsx`
- Test: manual browser verification

- [ ] **Step 1: Extract the repeated shell props**

`components/chat/image-generation/image-chat-shell.tsx`
```ts
import type React from 'react'

interface ImageChatShellProps {
  header: React.ReactNode
  emptyState: React.ReactNode
  messageList: React.ReactNode
  composer: React.ReactNode
  historySidebar: React.ReactNode
  hasMessages: boolean
  hasNewMessage: boolean
  onScrollToBottom: () => void
  accentColor: string
}
```

- [ ] **Step 2: Implement the reusable shell layout**

`components/chat/image-generation/image-chat-shell.tsx`
```tsx
import { ArrowDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ImageChatShellProps } from './image-chat-shell'

export function ImageChatShell({
  header,
  emptyState,
  messageList,
  composer,
  historySidebar,
  hasMessages,
  hasNewMessage,
  onScrollToBottom,
  accentColor,
}: ImageChatShellProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      <div className="flex min-w-0 flex-1 flex-col">
        {header}

        <div className="relative flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
              {hasMessages ? messageList : emptyState}
            </div>
          </div>

          <AnimatePresence>
            {hasNewMessage ? (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                onClick={onScrollToBottom}
                className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm text-white shadow-lg"
                style={{ backgroundColor: accentColor }}
              >
                <ArrowDown className="h-4 w-4" />
                新消息
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white p-3 md:p-6">
          <div className="mx-auto max-w-4xl">{composer}</div>
        </div>

        {historySidebar}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Replace duplicated top-level layout in GPT Image 2 and Banana**

In each file, preserve message rendering and history-sidebar internals, but replace the outer shell with:

```tsx
<ImageChatShell
  header={/* existing header JSX */}
  emptyState={/* existing empty state JSX */}
  messageList={/* existing mapped messages JSX */}
  composer={/* ImageChatComposer + hidden file input */}
  historySidebar={/* existing AnimatePresence sidebar JSX */}
  hasMessages={messages.length > 0}
  hasNewMessage={hasNewMessage}
  onScrollToBottom={scrollToBottom}
  accentColor={BRAND_GREEN}
/>
```

Use `BANANA_COLOR` for Banana.

- [ ] **Step 4: Run the app and verify shared shell does not break scrolling, messages, or sidebar**

Run: `npm run dev`
Expected:
- GPT Image 2 and Banana fullscreen pages still scroll correctly
- new-message button still appears
- history sidebar still opens
- overall visual density matches the new shared design
- mobile real-device feel is verified in browser, not only by reading code: on iPhone/Android, send 3 short messages, 1 long message, and 1 image-generation request; the header should feel light like ChatGPT, the first screen should show useful chat context without oversized gaps, and the bottom composer should stay stable when the keyboard opens

- [ ] **Step 5: Commit**

```bash
git add components/chat/image-generation/image-chat-shell.tsx components/chat/gpt-image2-chat-interface.tsx components/chat/banana-chat-interface.tsx
git commit -m "refactor: share image chat shell layout"
```

---

## Task 9: Manual regression pass for entry pages, fullscreen chat, and creative-panel entry links

**Files:**
- Modify: none unless issues are found
- Test: manual browser verification only

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Next.js dev server starts on `http://localhost:3000`

- [ ] **Step 2: Verify GPT Image 2 happy path**

Open `http://localhost:3000/chat/creative-image-gpt2`
Check:
- mode buttons visible
- size buttons visible
- upload button visible
- large prompt input visible
- clicking CTA routes to `/chat/gpt-image-2`
- chosen mode/size survive into composer pills
- first request auto-submits if prompt present

- [ ] **Step 3: Verify Banana happy path**

Open `http://localhost:3000/chat/creative-image-banana`
Check:
- same UI structure as GPT Image 2 entry page
- Banana size set visible
- clicking CTA routes to `/chat/banana-2-pro`
- selected size survives into Banana composer
- streaming response still renders images

- [ ] **Step 4: Verify creative-panel links still land on the new entry pages**

Open the multimedia panel from the main app and click:
- `banana`
- `Gpt image 2`
Expected:
- Banana lands on `/chat/creative-image-banana`
- GPT Image 2 lands on `/chat/creative-image-gpt2`

- [ ] **Step 5: Verify history-session navigation still works**

From both fullscreen chat pages:
- open history sidebar
- load same-model history session
- load cross-model history session
Expected:
- same-model history loads in place
- cross-model history still redirects to the correct model page

- [ ] **Step 6: Commit only if regression fixes were needed**

```bash
git add <only-the-files-you-fixed>
git commit -m "fix: resolve image chat UI regressions"
```

---

## Task 10: Final verification

**Files:**
- Modify: none

- [ ] **Step 1: Run the targeted Jest tests**

Run: `npm test -- --runTestsByPath __tests__/image-generation-config.test.ts __tests__/image-generation-routing.test.ts`
Expected: PASS

- [ ] **Step 2: Run the full Jest suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: PASS with no TypeScript or Next.js errors

- [ ] **Step 4: Final visual smoke test in browser**

Open:
- `http://localhost:3000/chat/creative-image-gpt2`
- `http://localhost:3000/chat/gpt-image-2`
- `http://localhost:3000/chat/creative-image-banana`
- `http://localhost:3000/chat/banana-2-pro`
Expected: entry pages and fullscreen chats all render, and the UI family clearly matches across both models

- [ ] **Step 5: Final commit**

```bash
git add components/chat/image-generation app/chat/creative-image-gpt2/page.tsx app/chat/creative-image-banana/page.tsx app/chat/gpt-image-2/page.tsx components/chat/gpt-image2-chat-interface.tsx components/chat/banana-chat-interface.tsx __tests__/image-generation-config.test.ts __tests__/image-generation-routing.test.ts
git commit -m "feat: unify image generation ui across GPT Image 2 and Banana"
```

---

## Self-Review

### Spec coverage
- GPT Image 2 entry page redesign: covered in Tasks 3, 4, 5
- fullscreen chat handoff after clicking generate/edit: covered in Tasks 4 and 5
- parameter pills above the bottom input in fullscreen chat: covered in Task 6
- Banana reusing the same UI code instead of page duplication: covered in Tasks 7 and 8
- preserving existing logic and backend behavior: preserved by only changing UI composition and route/state handoff in Tasks 4, 6, 8

### Placeholder scan
- No `TBD`, `TODO`, or vague “handle appropriately” steps remain
- All code-changing tasks include concrete code blocks
- All verification steps include exact commands or manual paths

### Type consistency
- Shared model names are consistently `gpt-image-2` and `banana-2-pro`
- Shared route helpers use `prompt`, `mode`, `size`, `files` query keys consistently
- Shared config, entry pages, and composer tasks all use the same size-option shape: `{ label, value, width, height }`
