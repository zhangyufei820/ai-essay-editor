/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { getUserGroups, getUserModels } from '@/features/playground/api'
import {
  cacheGeneratedMedia,
  createVideo,
  editImage,
  fetchVideo,
  generateImage,
} from './api'
import {
  compactJson,
  downloadUrl,
  extractImageResults,
  extractVideoTaskId,
  extractVideoUrl,
  fileToDataUrl,
  normalizeVideoStatus,
  splitSize,
} from './lib'
import {
  IMAGE_MODELS,
  MEDIA_MODEL_CONFIGS,
  VIDEO_MODELS,
  getMediaModelConfig,
} from './model-config'
import type {
  ImageWorkflow,
  MediaMode,
  MediaResult,
  ModelCapability,
  VideoWorkflow,
} from './types'


const SIZE_TO_ASPECT_RATIO: Record<string, string> = {
  '960x960': '1:1',
  '720x1280': '9:16',
  '1280x720': '16:9',
  '1168x784': '3:2',
  '784x1168': '2:3',
  '1024x1024': '1:1',
  '1024x1536': '2:3',
  '1536x1024': '3:2',
  '2048x2048': '1:1',
  '2048x4096': '1:2',
  '4096x2048': '2:1',
}

function isGrokImageModel(model: string) {
  return model === 'grok-imagine-image'
}

const DEFAULT_PROMPT =
  '一张高级科技感海报，主体是一位年轻创业者站在城市夜景前，干净、真实、有商业质感。'

export function MediaPlayground() {
  const [mode, setMode] = useState<MediaMode>('image')
  const [imageWorkflow, setImageWorkflow] = useState<ImageWorkflow>('generate')
  const [videoWorkflow, setVideoWorkflow] = useState<VideoWorkflow>('text')
  const [imageModel, setImageModel] = useState(IMAGE_MODELS[0].id)
  const [videoModel, setVideoModel] = useState(VIDEO_MODELS[0].id)
  const [group, setGroup] = useState('')
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [negativePrompt, setNegativePrompt] = useState('')
  const [size, setSize] = useState(IMAGE_MODELS[0].defaultSize)
  const [quality, setQuality] = useState(IMAGE_MODELS[0].defaultQuality ?? '')
  const [outputFormat, setOutputFormat] = useState('png')
  const [outputCompression, setOutputCompression] = useState(100)
  const [aspectRatio, setAspectRatio] = useState(
    IMAGE_MODELS[0].defaultAspectRatio ?? 'auto'
  )
  const [resolution, setResolution] = useState(
    IMAGE_MODELS[0].defaultResolution ?? 'auto'
  )
  const [inputFidelity, setInputFidelity] = useState('auto')
  const [background, setBackground] = useState('auto')
  const [count, setCount] = useState(1)
  const [duration, setDuration] = useState(VIDEO_MODELS[0].defaultDuration ?? 5)
  const [fps, setFps] = useState(VIDEO_MODELS[0].defaultFps ?? 24)
  const [seed, setSeed] = useState('')
  const [enhancePrompt, setEnhancePrompt] = useState(true)
  const [watermark, setWatermark] = useState(false)
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [lastFrameFile, setLastFrameFile] = useState<File | null>(null)
  const [maskFile, setMaskFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [taskMessage, setTaskMessage] = useState('')
  const [results, setResults] = useState<MediaResult[]>([])
  const [showRequest, setShowRequest] = useState(false)

  const activeModelId = mode === 'image' ? imageModel : videoModel
  const activeModel = getMediaModelConfig(activeModelId) ?? IMAGE_MODELS[0]

  const { data: userModels = [] } = useQuery({
    queryKey: ['media-playground-models'],
    queryFn: getUserModels,
  })

  const { data: userGroups = [] } = useQuery({
    queryKey: ['media-playground-groups'],
    queryFn: getUserGroups,
  })

  const modelAccess = useMemo(() => {
    const available = new Set(userModels.map((item) => item.value))
    return MEDIA_MODEL_CONFIGS.reduce<Record<string, boolean>>((acc, model) => {
      acc[model.id] = available.size === 0 || available.has(model.id)
      return acc
    }, {})
  }, [userModels])

  useEffect(() => {
    if (!group && userGroups.length > 0) {
      const fallback =
        userGroups.find((item) => item.value === 'default')?.value ??
        userGroups[0].value
      setGroup(fallback)
    }
  }, [group, userGroups])

  useEffect(() => {
    const model = getMediaModelConfig(activeModelId)
    if (!model) return
    setSize(model.defaultSize)
    setQuality(model.defaultQuality ?? '')
    if (model.kind === 'image') {
      setOutputFormat(model.outputFormats?.[0] ?? 'url')
      setAspectRatio(
        model.defaultAspectRatio ??
          model.aspectRatios?.[0] ??
          SIZE_TO_ASPECT_RATIO[model.defaultSize] ??
          'auto'
      )
      setResolution(model.defaultResolution ?? model.resolutions?.[0] ?? 'auto')
    }
    if (model.defaultDuration) setDuration(model.defaultDuration)
    if (model.defaultFps) setFps(model.defaultFps)
  }, [activeModelId])

  const requestPayload = useMemo(() => {
    if (mode === 'image') {
      const effectiveAspectRatio =
        aspectRatio && aspectRatio !== 'auto'
          ? aspectRatio
          : (SIZE_TO_ASPECT_RATIO[size] ?? '')
      const payload: Record<string, unknown> = {
        model: imageModel,
        group,
        prompt,
        n: count,
        size,
      }
      if (quality) payload.quality = quality
      if (isGrokImageModel(imageModel)) {
        if (effectiveAspectRatio) payload.aspect_ratio = effectiveAspectRatio
        if (resolution && resolution !== 'auto') payload.resolution = resolution
      }
      if (outputFormat && outputFormat !== 'url') {
        payload.output_format = outputFormat
      }
      if (
        activeModel.supportsOutputCompression &&
        outputFormat !== 'png' &&
        outputFormat !== 'url'
      ) {
        payload.output_compression = outputCompression
      }
      if (imageWorkflow === 'edit' && activeModel.supportsInputFidelity) {
        payload.input_fidelity = inputFidelity
      }
      if (background !== 'auto') payload.background = background
      if (negativePrompt.trim()) {
        payload.extra_fields = { negative_prompt: negativePrompt.trim() }
      }
      return payload
    }

    const { width, height } = splitSize(size)
    const payload: Record<string, unknown> = {
      model: videoModel,
      group,
      prompt,
      seconds: String(duration),
      duration,
      size,
      width,
      height,
      fps,
      response_format: 'url',
    }
    if (activeModel.supportsPromptEnhancement) {
      payload.enhance_prompt = enhancePrompt
    }
    if (activeModel.supportsWatermark) {
      payload.watermark = watermark
    }
    if (seed.trim()) payload.seed = Number(seed)
    if (negativePrompt.trim()) {
      payload.metadata = { negative_prompt: negativePrompt.trim() }
    }
    if (videoWorkflow === 'image') {
      payload.image = '上传的首帧图片会在提交时自动填入'
      payload.images = ['上传的首帧图片会在提交时自动填入']
    }
    if (videoWorkflow === 'first-last') {
      payload.image = '上传的首帧图片会在提交时自动填入'
      payload.images = [
        '上传的首帧图片会在提交时自动填入',
        '上传的尾帧图片会在提交时自动填入',
      ]
      payload.metadata = {
        ...(payload.metadata as Record<string, unknown> | undefined),
        last_frame_image: '上传的尾帧图片会在提交时自动填入',
        frames: [
          { role: 'first_frame', image: '上传的首帧图片会在提交时自动填入' },
          { role: 'last_frame', image: '上传的尾帧图片会在提交时自动填入' },
        ],
      }
    }
    return payload
  }, [
    activeModel.supportsInputFidelity,
    activeModel.supportsOutputCompression,
    activeModel.supportsPromptEnhancement,
    activeModel.supportsWatermark,
    background,
    count,
    duration,
    enhancePrompt,
    fps,
    group,
    imageModel,
    imageWorkflow,
    inputFidelity,
    mode,
    negativePrompt,
    outputCompression,
    outputFormat,
    prompt,
    quality,
    aspectRatio,
    resolution,
    seed,
    size,
    videoModel,
    videoWorkflow,
    watermark,
  ])

  const selectedModelAllowed = modelAccess[activeModelId] !== false

  async function cacheResult(result: MediaResult) {
    if (result.url.startsWith('data:')) return result
    try {
      const cached = await cacheGeneratedMedia(result.url, result.kind)
      return { ...result, cachedUrl: cached.url }
    } catch (error) {
      toast.warning(
        error instanceof Error
          ? error.message
          : '生成成功，但临时下载缓存失败，请直接下载原始链接。'
      )
      return result
    }
  }

  async function handleSubmit() {
    if (!selectedModelAllowed) {
      toast.error('当前用户分组暂未开放这个模型。')
      return
    }
    if (!prompt.trim()) {
      toast.error('请先写一句你想生成什么。')
      return
    }
    if (mode === 'image' && imageWorkflow === 'edit' && !referenceFile) {
      toast.error('图像修改需要先上传一张参考图。')
      return
    }
    if (mode === 'video' && videoWorkflow !== 'text' && !referenceFile) {
      toast.error('图生视频需要先上传首帧图片。')
      return
    }
    if (mode === 'video' && videoWorkflow === 'first-last' && !lastFrameFile) {
      toast.error('首尾帧视频需要同时上传首帧和尾帧。')
      return
    }

    setIsSubmitting(true)
    setTaskMessage(mode === 'video' ? '正在提交视频任务...' : '正在生成图像...')
    try {
      if (mode === 'image') {
        let response
        if (imageWorkflow === 'edit') {
          const form = new FormData()
          form.set('model', imageModel)
          form.set('group', group)
          form.set('prompt', prompt)
          form.set('n', String(count))
          form.set('size', size)
          if (quality) form.set('quality', quality)
          if (outputFormat && outputFormat !== 'url') {
            form.set('output_format', outputFormat)
          }
          if (
            activeModel.supportsOutputCompression &&
            outputFormat !== 'png' &&
            outputFormat !== 'url'
          ) {
            form.set('output_compression', String(outputCompression))
          }
          if (activeModel.supportsInputFidelity) {
            form.set('input_fidelity', inputFidelity)
          }
          if (background !== 'auto') form.set('background', background)
          if (referenceFile) form.set('image', referenceFile)
          if (maskFile) form.set('mask', maskFile)
          response = await editImage(form)
        } else {
          response = await generateImage(requestPayload)
        }
        if (response.error?.message) throw new Error(response.error.message)
        const generated = extractImageResults(response)
        if (generated.length === 0) {
          throw new Error('没有拿到可展示的图像链接。')
        }
        const cached = await Promise.all(generated.map(cacheResult))
        setResults((prev) => [...cached, ...prev])
        toast.success('图像已生成，请立即下载保存。')
        return
      }

      const payload = { ...requestPayload }
      if (videoWorkflow === 'image' || videoWorkflow === 'first-last') {
        const firstFrame = await fileToDataUrl(referenceFile!)
        payload.image = firstFrame
        payload.images = [firstFrame]
      }
      if (videoWorkflow === 'first-last') {
        const lastFrame = await fileToDataUrl(lastFrameFile!)
        payload.images = [payload.image, lastFrame]
        payload.metadata = {
          ...(payload.metadata as Record<string, unknown> | undefined),
          last_frame_image: lastFrame,
          frames: [
            { role: 'first_frame', image: payload.image },
            { role: 'last_frame', image: lastFrame },
          ],
        }
      }

      const submit = await createVideo(payload)
      if (submit.error?.message) throw new Error(submit.error.message)
      const taskId = extractVideoTaskId(submit)
      if (!taskId) throw new Error('视频任务提交成功但没有返回任务 ID。')
      setTaskMessage(`视频任务已提交：${taskId}，正在等待结果...`)

      const videoResult = await pollVideo(taskId)
      const cached = await cacheResult(videoResult)
      setResults((prev) => [cached, ...prev])
      toast.success('视频已生成，请立即下载保存。')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '生成失败')
    } finally {
      setIsSubmitting(false)
      setTaskMessage('')
    }
  }

  async function pollVideo(taskId: string): Promise<MediaResult> {
    const deadline = Date.now() + 10 * 60 * 1000
    while (Date.now() < deadline) {
      const response = await fetchVideo(taskId)
      const status = normalizeVideoStatus(response.status)
      setTaskMessage(`视频任务 ${status}，进度 ${response.progress ?? 0}%`)
      if (status === 'completed') {
        const url = extractVideoUrl(response)
        if (!url) throw new Error('视频完成但没有返回视频地址。')
        return {
          id: `video-${taskId}`,
          kind: 'video',
          url,
          taskId,
          status,
          createdAt: Date.now(),
        }
      }
      if (status === 'failed') {
        throw new Error(response.error?.message || '视频任务失败。')
      }
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
    throw new Error('视频生成等待超时，请稍后到任务日志查看结果。')
  }

  return (
    <div className='bg-background min-h-full'>
      <div className='mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6'>
        <MediaHeader mode={mode} onModeChange={setMode} />

        <div className='grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]'>
          <section className='bg-card text-card-foreground rounded-lg border'>
            <div className='border-b p-4'>
              <div className='flex items-center justify-between gap-3'>
                <div>
                  <h2 className='text-base font-semibold'>生成设置</h2>
                  <p className='text-muted-foreground mt-1 text-sm'>
                    选择模型和用途，系统会自动整理请求格式。
                  </p>
                </div>
                <Badge
                  variant={selectedModelAllowed ? 'secondary' : 'destructive'}
                >
                  {selectedModelAllowed ? '可用' : '无权限'}
                </Badge>
              </div>
            </div>

            <div className='space-y-5 p-4'>
              {mode === 'image' ? (
                <ImageControls
                  activeModel={activeModel}
                  modelAccess={modelAccess}
                  modelValue={imageModel}
                  workflow={imageWorkflow}
                  onModelChange={setImageModel}
                  onWorkflowChange={setImageWorkflow}
                />
              ) : (
                <VideoControls
                  activeModel={activeModel}
                  modelAccess={modelAccess}
                  modelValue={videoModel}
                  workflow={videoWorkflow}
                  onModelChange={setVideoModel}
                  onWorkflowChange={setVideoWorkflow}
                />
              )}

              <Field label='用户分组'>
                <NativeSelect
                  className='w-full'
                  value={group}
                  onChange={(event) => setGroup(event.target.value)}
                >
                  {userGroups.map((item) => (
                    <NativeSelectOption key={item.value} value={item.value}>
                      {item.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              <Field label='你想生成什么'>
                <Textarea
                  className='min-h-32 resize-none'
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder='用自然语言描述画面、主体、风格、镜头和用途。'
                />
              </Field>

              <Field label='不想出现的内容'>
                <Input
                  value={negativePrompt}
                  onChange={(event) => setNegativePrompt(event.target.value)}
                  placeholder='可选，例如：低清晰度、畸形手指、文字错误'
                />
              </Field>

              {(imageWorkflow === 'edit' ||
                (mode === 'video' && videoWorkflow !== 'text')) && (
                <UploadPanel
                  videoWorkflow={videoWorkflow}
                  referenceFile={referenceFile}
                  lastFrameFile={lastFrameFile}
                  maskFile={maskFile}
                  showMask={mode === 'image' && imageWorkflow === 'edit'}
                  onReferenceFileChange={setReferenceFile}
                  onLastFrameFileChange={setLastFrameFile}
                  onMaskFileChange={setMaskFile}
                />
              )}

              <MediaParameters
                activeModel={activeModel}
                mode={mode}
                imageWorkflow={imageWorkflow}
                count={count}
                duration={duration}
                fps={fps}
                inputFidelity={inputFidelity}
                quality={quality}
                outputFormat={outputFormat}
                outputCompression={outputCompression}
                background={background}
                enhancePrompt={enhancePrompt}
                watermark={watermark}
                seed={seed}
                size={size}
                onCountChange={setCount}
                onDurationChange={setDuration}
                onEnhancePromptChange={setEnhancePrompt}
                onFpsChange={setFps}
                onInputFidelityChange={setInputFidelity}
                onQualityChange={setQuality}
                onOutputFormatChange={setOutputFormat}
                onOutputCompressionChange={setOutputCompression}
                aspectRatio={aspectRatio}
                resolution={resolution}
                onAspectRatioChange={setAspectRatio}
                onResolutionChange={setResolution}
                onBackgroundChange={setBackground}
                onSeedChange={setSeed}
                onSizeChange={setSize}
                onWatermarkChange={setWatermark}
              />

              <div className='bg-muted/50 rounded-lg border p-3 text-sm'>
                <div className='flex gap-2'>
                  <AlertCircle className='mt-0.5 size-4 shrink-0' />
                  <p>
                    图像和视频生成后请立即下载。操练场只保留临时文件 1 小时，
                    到期会自动清理。
                  </p>
                </div>
              </div>

              <Button
                className='h-10 w-full'
                onClick={handleSubmit}
                disabled={isSubmitting || !selectedModelAllowed}
              >
                {isSubmitting ? (
                  <Loader2 className='mr-2 size-4 animate-spin' />
                ) : mode === 'image' ? (
                  <Wand2 className='mr-2 size-4' />
                ) : (
                  <Film className='mr-2 size-4' />
                )}
                {isSubmitting
                  ? '生成中...'
                  : mode === 'image'
                    ? '生成图像'
                    : '生成视频'}
              </Button>
            </div>
          </section>

          <section className='bg-card flex min-h-[640px] flex-col rounded-lg border'>
            <div className='flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between'>
              <div>
                <h2 className='text-base font-semibold'>结果预览</h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                  可预览、复制链接，也可以直接下载临时文件。
                </p>
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setShowRequest((value) => !value)}
              >
                <Copy className='mr-2 size-4' />
                {showRequest ? '隐藏请求' : '查看请求'}
              </Button>
            </div>

            {taskMessage && (
              <div className='bg-muted/40 mx-4 mt-4 rounded-lg border p-3 text-sm'>
                <div className='flex items-center gap-2'>
                  <Loader2 className='size-4 animate-spin' />
                  <span>{taskMessage}</span>
                </div>
              </div>
            )}

            {showRequest && (
              <pre className='bg-muted/40 mx-4 mt-4 max-h-72 overflow-auto rounded-lg border p-3 text-xs leading-relaxed'>
                {compactJson(requestPayload)}
              </pre>
            )}

            <ResultGrid results={results} />
          </section>
        </div>
      </div>
    </div>
  )
}

function MediaHeader({
  mode,
  onModeChange,
}: {
  mode: MediaMode
  onModeChange: (mode: MediaMode) => void
}) {
  return (
    <header className='bg-card flex flex-col gap-4 rounded-lg border p-4 md:flex-row md:items-center md:justify-between md:p-5'>
      <div className='min-w-0'>
        <div className='text-muted-foreground flex items-center gap-2 text-sm'>
          <Sparkles className='size-4' />
          星人媒体工坊
        </div>
        <h1 className='mt-2 text-2xl font-semibold tracking-normal md:text-3xl'>
          图像和视频生成
        </h1>
        <p className='text-muted-foreground mt-2 max-w-2xl text-sm'>
          面向不会写 API
          的用户：选择模型、填写画面描述、上传参考图，然后下载结果。
        </p>
      </div>
      <Tabs
        value={mode}
        onValueChange={(value) => onModeChange(value as MediaMode)}
      >
        <TabsList>
          <TabsTrigger value='image'>
            <ImageIcon className='size-4' />
            图像
          </TabsTrigger>
          <TabsTrigger value='video'>
            <Film className='size-4' />
            视频
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </header>
  )
}

function ImageControls(props: {
  activeModel: ModelCapability
  modelAccess: Record<string, boolean>
  modelValue: string
  workflow: ImageWorkflow
  onModelChange: (value: string) => void
  onWorkflowChange: (value: ImageWorkflow) => void
}) {
  const workflowDisabled = !props.activeModel.supportsEdit
  return (
    <div className='space-y-4'>
      <Field label='图像模型'>
        <ModelSelect
          models={IMAGE_MODELS}
          modelAccess={props.modelAccess}
          value={props.modelValue}
          onChange={props.onModelChange}
        />
      </Field>
      <Segmented
        value={props.workflow}
        items={[
          { value: 'generate', label: '文生图', icon: ImageIcon },
          {
            value: 'edit',
            label: '图像修改',
            icon: Upload,
            disabled: workflowDisabled,
          },
        ]}
        onChange={(value) => props.onWorkflowChange(value as ImageWorkflow)}
      />
      <ModelNotes model={props.activeModel} />
    </div>
  )
}

function VideoControls(props: {
  activeModel: ModelCapability
  modelAccess: Record<string, boolean>
  modelValue: string
  workflow: VideoWorkflow
  onModelChange: (value: string) => void
  onWorkflowChange: (value: VideoWorkflow) => void
}) {
  return (
    <div className='space-y-4'>
      <Field label='视频模型'>
        <ModelSelect
          models={VIDEO_MODELS}
          modelAccess={props.modelAccess}
          value={props.modelValue}
          onChange={props.onModelChange}
        />
      </Field>
      <Segmented
        value={props.workflow}
        items={[
          { value: 'text', label: '文生视频', icon: Film },
          { value: 'image', label: '图生视频', icon: Upload },
          { value: 'first-last', label: '首尾帧', icon: CheckCircle2 },
        ]}
        onChange={(value) => props.onWorkflowChange(value as VideoWorkflow)}
      />
      <ModelNotes model={props.activeModel} />
    </div>
  )
}

function ModelSelect(props: {
  models: ModelCapability[]
  modelAccess: Record<string, boolean>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <NativeSelect
      className='w-full'
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {props.models.map((model) => (
        <NativeSelectOption key={model.id} value={model.id}>
          {model.label}
          {props.modelAccess[model.id] === false ? '（当前分组未开放）' : ''}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}

function ModelNotes({ model }: { model: ModelCapability }) {
  return (
    <div className='bg-muted/30 rounded-lg border p-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant='outline'>{model.vendorLabel}</Badge>
        <Badge variant='outline'>{model.endpoint}</Badge>
      </div>
      <p className='text-foreground mt-3 text-sm'>{model.description}</p>
      <ul className='text-muted-foreground mt-2 space-y-1 text-xs'>
        {model.notes.map((note) => (
          <li key={note}>- {note}</li>
        ))}
      </ul>
    </div>
  )
}

function MediaParameters(props: {
  activeModel: ModelCapability
  mode: MediaMode
  imageWorkflow: ImageWorkflow
  count: number
  duration: number
  enhancePrompt: boolean
  fps: number
  inputFidelity: string
  quality: string
  outputFormat: string
  outputCompression: number
  aspectRatio: string
  resolution: string
  background: string
  watermark: boolean
  seed: string
  size: string
  onCountChange: (value: number) => void
  onDurationChange: (value: number) => void
  onEnhancePromptChange: (value: boolean) => void
  onFpsChange: (value: number) => void
  onInputFidelityChange: (value: string) => void
  onQualityChange: (value: string) => void
  onOutputFormatChange: (value: string) => void
  onOutputCompressionChange: (value: number) => void
  onAspectRatioChange: (value: string) => void
  onResolutionChange: (value: string) => void
  onBackgroundChange: (value: string) => void
  onSeedChange: (value: string) => void
  onSizeChange: (value: string) => void
  onWatermarkChange: (value: boolean) => void
}) {
  return (
    <div className='grid gap-4 sm:grid-cols-2'>
      <Field label={props.mode === 'image' ? '画面尺寸' : '视频尺寸'}>
        <NativeSelect
          className='w-full'
          value={props.size}
          onChange={(event) => props.onSizeChange(event.target.value)}
        >
          {props.activeModel.sizes.map((size) => (
            <NativeSelectOption key={size} value={size}>
              {size}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>

      {props.mode === 'image' && (
        <>
          <Field label='清晰度'>
            <NativeSelect
              className='w-full'
              value={props.quality}
              onChange={(event) => props.onQualityChange(event.target.value)}
            >
              {(props.activeModel.qualities ?? ['auto']).map((quality) => (
                <NativeSelectOption key={quality} value={quality}>
                  {quality}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label='生成数量'>
            <div className='flex items-center gap-3'>
              <Slider
                min={1}
                max={4}
                step={1}
                value={[props.count]}
                onValueChange={(value) =>
                  props.onCountChange(
                    Array.isArray(value) ? (value[0] ?? 1) : value
                  )
                }
              />
              <span className='w-8 text-right text-sm'>{props.count}</span>
            </div>
          </Field>
          <Field label='输出格式'>
            <NativeSelect
              className='w-full'
              value={props.outputFormat}
              onChange={(event) =>
                props.onOutputFormatChange(event.target.value)
              }
            >
              {(props.activeModel.outputFormats ?? ['url']).map((format) => (
                <NativeSelectOption key={format} value={format}>
                  {format}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {props.activeModel.aspectRatios?.length ? (
            <Field label='宽高比'>
              <NativeSelect
                className='w-full'
                value={props.aspectRatio}
                onChange={(event) =>
                  props.onAspectRatioChange(event.target.value)
                }
              >
                {props.activeModel.aspectRatios.map((ratio) => (
                  <NativeSelectOption key={ratio} value={ratio}>
                    {ratio}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          ) : null}
          {props.activeModel.resolutions?.length ? (
            <Field label='分辨率'>
              <NativeSelect
                className='w-full'
                value={props.resolution}
                onChange={(event) =>
                  props.onResolutionChange(event.target.value)
                }
              >
                {props.activeModel.resolutions.map((resolution) => (
                  <NativeSelectOption key={resolution} value={resolution}>
                    {resolution}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          ) : null}
          {props.activeModel.supportsOutputCompression &&
            props.outputFormat !== 'png' &&
            props.outputFormat !== 'url' && (
              <Field label='压缩质量'>
                <div className='flex items-center gap-3'>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[props.outputCompression]}
                    onValueChange={(value) =>
                      props.onOutputCompressionChange(
                        Array.isArray(value) ? (value[0] ?? 100) : value
                      )
                    }
                  />
                  <span className='w-10 text-right text-sm'>
                    {props.outputCompression}
                  </span>
                </div>
              </Field>
            )}
          <Field label='背景'>
            <NativeSelect
              className='w-full'
              value={props.background}
              onChange={(event) => props.onBackgroundChange(event.target.value)}
            >
              <NativeSelectOption value='auto'>auto</NativeSelectOption>
              <NativeSelectOption value='transparent'>
                transparent
              </NativeSelectOption>
              <NativeSelectOption value='opaque'>opaque</NativeSelectOption>
            </NativeSelect>
          </Field>
          {props.imageWorkflow === 'edit' &&
            props.activeModel.supportsInputFidelity && (
              <Field label='参考图保真度'>
                <NativeSelect
                  className='w-full'
                  value={props.inputFidelity}
                  onChange={(event) =>
                    props.onInputFidelityChange(event.target.value)
                  }
                >
                  <NativeSelectOption value='auto'>auto</NativeSelectOption>
                  <NativeSelectOption value='low'>low</NativeSelectOption>
                  <NativeSelectOption value='high'>high</NativeSelectOption>
                </NativeSelect>
              </Field>
            )}
        </>
      )}

      {props.mode === 'video' && (
        <>
          <Field label='时长'>
            <NativeSelect
              className='w-full'
              value={String(props.duration)}
              onChange={(event) =>
                props.onDurationChange(Number(event.target.value))
              }
            >
              {(props.activeModel.durations ?? [5]).map((duration) => (
                <NativeSelectOption key={duration} value={duration}>
                  {duration} 秒
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label='帧率'>
            <NativeSelect
              className='w-full'
              value={String(props.fps)}
              onChange={(event) =>
                props.onFpsChange(Number(event.target.value))
              }
            >
              {(props.activeModel.fps ?? [24]).map((fps) => (
                <NativeSelectOption key={fps} value={fps}>
                  {fps} fps
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label='Seed'>
            <Input
              inputMode='numeric'
              value={props.seed}
              onChange={(event) => props.onSeedChange(event.target.value)}
              placeholder='可选，留空随机'
            />
          </Field>
          {props.activeModel.supportsPromptEnhancement && (
            <SwitchField
              label='智能润色提示词'
              description='开启后让上游优化镜头语言，适合小白用户；关闭则更严格按原文执行。'
              checked={props.enhancePrompt}
              onCheckedChange={props.onEnhancePromptChange}
            />
          )}
          {props.activeModel.supportsWatermark && (
            <SwitchField
              label='添加水印'
              description='默认关闭，方便用户直接保存成品。'
              checked={props.watermark}
              onCheckedChange={props.onWatermarkChange}
            />
          )}
        </>
      )}
    </div>
  )
}

function UploadPanel(props: {
  videoWorkflow: VideoWorkflow
  referenceFile: File | null
  lastFrameFile: File | null
  maskFile: File | null
  showMask: boolean
  onReferenceFileChange: (file: File | null) => void
  onLastFrameFileChange: (file: File | null) => void
  onMaskFileChange: (file: File | null) => void
}) {
  return (
    <div className='grid gap-3'>
      <FileInput
        label='参考图 / 首帧'
        file={props.referenceFile}
        onChange={props.onReferenceFileChange}
      />
      {props.videoWorkflow === 'first-last' && (
        <FileInput
          label='尾帧'
          file={props.lastFrameFile}
          onChange={props.onLastFrameFileChange}
        />
      )}
      {props.showMask && (
        <FileInput
          label='遮罩图（可选）'
          file={props.maskFile}
          onChange={props.onMaskFileChange}
        />
      )}
    </div>
  )
}

function FileInput({
  label,
  file,
  onChange,
}: {
  label: string
  file: File | null
  onChange: (file: File | null) => void
}) {
  return (
    <label className='bg-muted/20 hover:bg-muted/40 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center transition-colors'>
      <Upload className='text-muted-foreground size-5' />
      <span className='mt-2 text-sm font-medium'>{label}</span>
      <span className='text-muted-foreground mt-1 max-w-full truncate text-xs'>
        {file ? file.name : '点击上传 PNG / JPG / WEBP'}
      </span>
      <input
        type='file'
        accept='image/png,image/jpeg,image/webp'
        className='sr-only'
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </label>
  )
}

function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) {
  return (
    <div className='bg-muted/20 flex min-h-20 items-center justify-between gap-3 rounded-lg border p-3'>
      <div className='min-w-0'>
        <div className='text-sm font-medium'>{label}</div>
        <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>
          {description}
        </p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function ResultGrid({ results }: { results: MediaResult[] }) {
  if (results.length === 0) {
    return (
      <div className='flex flex-1 items-center justify-center p-6'>
        <div className='max-w-sm text-center'>
          <div className='bg-muted/40 mx-auto flex size-12 items-center justify-center rounded-lg border'>
            <Sparkles className='text-muted-foreground size-5' />
          </div>
          <h3 className='mt-4 text-base font-semibold'>等待你的第一个作品</h3>
          <p className='text-muted-foreground mt-2 text-sm'>
            生成完成后，图像和视频会出现在这里。临时文件只保留 1 小时。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className='grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3'>
      {results.map((result) => {
        const usableUrl = result.cachedUrl || result.url
        return (
          <div
            key={result.id}
            className='bg-background overflow-hidden rounded-lg border'
          >
            <div className='bg-muted/30 flex aspect-square items-center justify-center overflow-hidden'>
              {result.kind === 'image' ? (
                <img
                  src={usableUrl}
                  alt='generated result'
                  className='h-full w-full object-contain'
                />
              ) : (
                <video
                  src={usableUrl}
                  className='h-full w-full object-contain'
                  controls
                  playsInline
                />
              )}
            </div>
            <div className='space-y-3 p-3'>
              <div className='flex items-center justify-between gap-2'>
                <Badge variant='secondary'>
                  {result.kind === 'image' ? '图像' : '视频'}
                </Badge>
                <span className='text-muted-foreground text-xs'>
                  1小时内有效
                </span>
              </div>
              {result.revisedPrompt && (
                <p className='text-muted-foreground line-clamp-2 text-xs'>
                  {result.revisedPrompt}
                </p>
              )}
              <div className='grid grid-cols-2 gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    void navigator.clipboard.writeText(usableUrl)
                    toast.success('链接已复制')
                  }}
                >
                  <Copy className='mr-2 size-4' />
                  复制
                </Button>
                <Button
                  size='sm'
                  onClick={() =>
                    downloadUrl(
                      usableUrl,
                      result.kind === 'image'
                        ? 'xingren-image.png'
                        : 'xingren-video.mp4'
                    )
                  }
                >
                  <Download className='mr-2 size-4' />
                  下载
                </Button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className='block space-y-2'>
      <span className='text-sm font-medium'>{label}</span>
      {children}
    </label>
  )
}

function Segmented(props: {
  value: string
  items: Array<{
    value: string
    label: string
    icon: React.ElementType
    disabled?: boolean
  }>
  onChange: (value: string) => void
}) {
  return (
    <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
      {props.items.map((item) => (
        <button
          key={item.value}
          type='button'
          disabled={item.disabled}
          onClick={() => props.onChange(item.value)}
          className={cn(
            'flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors',
            props.value === item.value
              ? 'border-primary bg-primary text-primary-foreground'
              : 'bg-background hover:bg-muted',
            item.disabled && 'cursor-not-allowed opacity-40'
          )}
        >
          <item.icon className='size-4' />
          {item.label}
        </button>
      ))}
    </div>
  )
}
